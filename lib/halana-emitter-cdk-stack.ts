import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPattern from 'aws-cdk-lib/aws-ecs-patterns';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

import { DUMMY, DEVELOP } from '../utils/constants';
export class HalanaEmitterCdkStack extends Stack {
  private props: any;
  private env?: string = DEVELOP;
  private vpc: ec2.Vpc;
  private cluster: ecs.Cluster;
  private hostedZone: route53.IHostedZone;
  private certificate: acm.Certificate;
  private serviceSG: ec2.SecurityGroup;
  private albSG: ec2.SecurityGroup;
  private loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.props = props?.tags;
    this.env = props?.tags?.env;
  }

  private createVPC() {
    const subnetConfiguration: ec2.SubnetConfiguration[] = [
      {
        cidrMask: 20,
        name: `${this.stackName}-emitter-vpc-public`,
        subnetType: ec2.SubnetType.PUBLIC,
      },
    ];
    let props: ec2.VpcProps = {
      vpcName: `${this.stackName}-emitter-vpc-${this.env?.toLocaleLowerCase()}`,
      subnetConfiguration,
      cidr: this.props?.vpcCidr,
    };
    if (this.env !== DEVELOP) {
      subnetConfiguration.push(
        {
          cidrMask: 20,
          name: `${this.stackName}-emitter-vpc-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        {
          cidrMask: 20,
          name: `${this.stackName}-emitter-vpc-isolate`,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      );
      props = { ...props, natGateways: 1, subnetConfiguration };
    }
    this.vpc = new ec2.Vpc(this, `HalanaEmitterVPCStack${this.env}`, props);
  }

  private createCluster() {
    this.cluster = new ecs.Cluster(this, `HalanaEmitterCLusterStackDev${this.env}`, {
      clusterName: `${this.stackName}-emitter-${this.env?.toLowerCase()}`,
      containerInsights: true,
      vpc: this.vpc,
    });
  }

  private createACM() {
    const { zoneName } = this.props;
    this.hostedZone = route53.HostedZone.fromLookup(this, `HichatHostedZone${this.env}`, {
      domainName: zoneName,
    });
    const { hostedZoneArn } = this.hostedZone;
    if (hostedZoneArn.split('/')[1] === DUMMY) {
      this.hostedZone = new route53.HostedZone(this, `HichatHostedZone${this.env}`, {
        zoneName,
      });
      this.hostedZone.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
    this.certificate = new acm.Certificate(this, `HalanaEmitterCertificate${this.env}`, {
      domainName: `*.${zoneName}`,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });
  }

  private createSecurityGroup() {
    this.albSG = new ec2.SecurityGroup(this, `HalanaEmitter${this.env}`, {
      vpc: this.vpc,
      allowAllOutbound: false,
      securityGroupName: `HalanaEmitterAlb${this.env}`,
    });
    this.serviceSG = new ec2.SecurityGroup(this, `HalanaEmitterService${this.env}`, {
      vpc: this.vpc,
      allowAllOutbound: false,
      securityGroupName: `HalanaEmitterService${this.env}`,
    });
    this.albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    this.albSG.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(80));
    this.albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    this.albSG.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(443));
    this.albSG.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp());
    this.albSG.addEgressRule(ec2.Peer.anyIpv6(), ec2.Port.allTcp());
    this.serviceSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8080));
    this.serviceSG.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(8080));
    this.serviceSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    this.serviceSG.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(80));
    this.serviceSG.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp());
    this.serviceSG.addEgressRule(ec2.Peer.anyIpv6(), ec2.Port.allTcp());
  }

  private createAlbFargate() {
    const { domainName, emitterLicense } = this.props;
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, `HalanaEmitterLB${this.env}`, {
      vpc: this.vpc,
      internetFacing: true,
      securityGroup: this.albSG,
      loadBalancerName: `HalanaEmitterLB${this.env}`,
    });

    const listener: elbv2.ApplicationListener = this.loadBalancer.addListener(`HalanaEmitterLBListener${this.env}`, {
      port: 8443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [this.certificate],
    });

    const albTarget = new elbv2.ApplicationTargetGroup(this, `HalanaEmitterTG${this.env}`, {
      targetGroupName: `HalanaEmitter${this.env}`,
      port: 8080,
      vpc: this.vpc,
      targetType: elbv2.TargetType.IP,

      healthCheck: {
        path: '/keygen',
        port: '8080',
        protocol: elbv2.Protocol.HTTPS,
      },
    });
    listener.addTargetGroups(`HalanaEmitterLBTarget${this.env}`, {
      targetGroups: [albTarget],
    });

    const repository: ecr.IRepository = ecr.Repository.fromRepositoryName(
      this,
      'HalanaEmitterEcr',
      this.props.ecrRepositoryName,
    );

    const taskImageOptions: ecsPattern.ApplicationLoadBalancedTaskImageOptions = {
      image: ecs.ContainerImage.fromEcrRepository(repository),
      enableLogging: true,
      containerPort: 8080,
      containerName: 'emitter',
    };
    if (emitterLicense) {
      Object.assign(taskImageOptions, { environment: { EMITTER_LICENSE: emitterLicense } });
    }
    new ecsPattern.ApplicationLoadBalancedFargateService(this, `HalanaEmitterLoadbalancerStack${this.env}`, {
      loadBalancerName: `${this.stackName}-emitter-loadbalancer`,
      serviceName: `${this.stackName}-emitter-service-loadbalancer`,
      assignPublicIp: true,
      certificate: this.certificate,
      domainName,
      domainZone: this.hostedZone,
      healthCheckGracePeriod: Duration.seconds(60),
      recordType: ecsPattern.ApplicationLoadBalancedServiceRecordType.ALIAS,
      cluster: this.cluster,
      circuitBreaker: {
        rollback: true,
      },
      cpu: 512,
      loadBalancer: this.loadBalancer,
      redirectHTTP: true,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      desiredCount: 1,
      memoryLimitMiB: 1024,
      minHealthyPercent: 100,
      securityGroups: [this.serviceSG],
      taskImageOptions,
    });
  }
  public init() {
    this.createACM();
    this.createVPC();
    this.createSecurityGroup();
    this.createCluster();
    this.createAlbFargate();
  }
}

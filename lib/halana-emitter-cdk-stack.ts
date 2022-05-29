import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPattern from 'aws-cdk-lib/aws-ecs-patterns';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
export class HalanaEmitterCdkStack extends Stack {
  private props: any;
  private env?: string = 'Develop';
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.props = props?.tags;
    this.env = props?.tags?.env;
  }
  private vpc: ec2.Vpc;
  private cluster: ecs.Cluster;
  private hostedZone: route53.HostedZone;
  private repository: ecr.Repository;
  private certificate: acm.Certificate;
  private createECR() {
    this.repository = new ecr.Repository(this, `HalanaEmitterEcrStack${this.env}`, {
      repositoryName: `${this.stackName}-emitter`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      encryption: ecr.RepositoryEncryption.AES_256,
    });
    this.repository.addLifecycleRule({ tagPrefixList: ['dev', 'staging'], maxImageCount: 100 });
  }

  private createVPC() {
    const props: ec2.VpcProps = {
      vpcName: `${this.stackName}-emitter-vpc`,
    };
    if (this.env !== 'Develop') {
      Object.assign(props, {
        cidr: '10.0.0.0/16',
        natGateways: 1,
        subnetConfiguration: [
          {
            cidrMask: 20,
            name: `${this.stackName}-emitter-vpc-public`,
            subnetType: ec2.SubnetType.PUBLIC,
          },
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
        ],
      });
    }
    this.vpc = new ec2.Vpc(this, `HalanaEmitterVPCStack${this.env}`, props);
  }

  private createCluster() {
    this.cluster = new ecs.Cluster(this, `HalanaEmitterCLusterStackDev${this.env}`, {
      clusterName: `${this.stackName}-emitter-cluster`,
      containerInsights: true,
      vpc: this.vpc,
    });
  }

  private createACM() {
    this.hostedZone = new route53.HostedZone(this, `HichatHostedZone${this.env}`, {
      zoneName: 'hichat.io',
    });
    this.certificate = new acm.Certificate(this, `HalanaEmitterCertificate${this.env}`, {
      domainName: 'dev-emitter.hichat.io',
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });
  }

  private createLoadbalancer() {
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, `HalanaEmitterLB${this.env}`, {
      vpc: this.vpc,
      internetFacing: true,
    });
    const listener = loadBalancer.addListener(`HalanaEmitterLBListener${this.env}`, {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: true,
    });
    // listener.
    // listener.addCertificates('HalanaEmitterLbCer', [this.certificate]);

    listener.addTargets(`HalanaEmitterLBTarget${this.env}`, {
      port: 80,
      targets: [
        new autoscaling.AutoScalingGroup(this, 'HalanaEmitterLBTargetASGDev', {
          vpc: this.vpc,
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
          machineImage: new ec2.AmazonLinuxImage(),
        }),
      ],
    });

    const loadBalancerEcsService = new ecsPattern.ApplicationLoadBalancedFargateService(
      this,
      `HalanaEmitterLoadbalancerStack${this.env}`,
      {
        loadBalancerName: `${this.stackName}-emitter-loadbalancer`,
        serviceName: `${this.stackName}-emitter-service-loadbalancer`,
        domainName: 'dev-emitter.hichat.io',
        domainZone: this.hostedZone,
        cluster: this.cluster,
        circuitBreaker: {
          rollback: true,
        },
        cpu: 512,
        sslPolicy: elbv2.SslPolicy.RECOMMENDED,
        certificate: this.certificate,
        desiredCount: 1,
        listenerPort: 443,
        redirectHTTP: true,
        memoryLimitMiB: 1024,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        securityGroups: [
          new ec2.SecurityGroup(this, `HalanaEmitterVpcSG${this.env}`, {
            vpc: this.vpc,
          }),
        ],
        loadBalancer,
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(this.repository),
          enableLogging: true,
          containerPort: 80,
          containerName: 'emitter',
          environment: {
            EMITTER_LICENSE: '',
            EMITTER_LISTEN: '80',
          },
        },
      },
    );
    loadBalancerEcsService.targetGroup.configureHealthCheck({
      path: '/keygen',
    });
  }
  public init() {
    this.createECR();
    this.createVPC();
    this.createACM();
    this.createCluster();
    this.createLoadbalancer();
  }
}

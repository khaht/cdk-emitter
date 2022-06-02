import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecrDeploy from 'cdk-ecr-deployment';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class HalanaEmitterResourceStack extends Stack {
  private props: any;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.props = props?.tags;
  }
  private createECR() {
    const repository = new ecr.Repository(this, 'HalanaEmitterEcrStack', {
      repositoryName: this.props.ecrRepositoryName,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      encryption: ecr.RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    repository.addLifecycleRule({ maxImageCount: 5 });

    new ecrDeploy.ECRDeployment(this as any, 'PushEmitterImageToEcr', {
      src: new ecrDeploy.DockerImageName('emitter/server:latest'),
      dest: new ecrDeploy.DockerImageName(`${repository.repositoryUri}:latest`),
    });
  }
  public init() {
    this.createECR();
  }
}

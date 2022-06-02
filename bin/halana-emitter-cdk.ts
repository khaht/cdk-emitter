#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HalanaEmitterCdkStack } from '../lib/halana-emitter-cdk-stack';
import { HalanaEmitterResourceStack } from '../lib/resource-stack';
import { DEVELOP, ECR_REPOSITORY_NAME, PRODUCTION } from '../utils/constants';

const app = new cdk.App();
new HalanaEmitterResourceStack(app, 'HalanaEmitterResourceStack', {
  stackName: 'halana-emitter-resource',
  tags: {
    ecrRepositoryName: ECR_REPOSITORY_NAME,
  },
}).init();

new HalanaEmitterCdkStack(app, 'HalanaEmitterAppStackDev', {
  stackName: 'halana-emitter-app-dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    env: DEVELOP,
    zoneName: 'hichat.io',
    domainName: 'develop-emitter.hichat.io',
    vpcCidr: '10.0.0.0/16',
    ecrRepositoryName: ECR_REPOSITORY_NAME,
    emitterLicense: 'PfA8ICQGgM_2gkg47Fm30UXEHjzWGfHQI3PBP4h0MuYmKCqrEKwT5-fMwTb0ZMMCsU83Mqim-eKnAoyZuogCAQ:3',
  },
}).init();

new HalanaEmitterCdkStack(app, 'HalanaEmitterAppStackProd', {
  stackName: 'halana-emitter-app-prod',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    env: PRODUCTION,
    zoneName: 'hichat.io',
    domainName: 'emitter.hichat.io',
    vpcCidr: '10.0.0.0/16',
    ecrRepositoryName: ECR_REPOSITORY_NAME,
    emitterLicense: '',
  },
}).init();

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HalanaEmitterCdkStack } from '../lib/halana-emitter-cdk-stack';

const app = new cdk.App();
new HalanaEmitterCdkStack(app, 'HalanaEmitterCdkStackDev', {
  stackName: 'halana',
  tags: {
    env: 'Develop',
  },
}).init();

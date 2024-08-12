import { App } from 'aws-cdk-lib';  // Corrected import for App
import { MyStack } from '../lib/cdk-stack';

const app = new App();  // Using App from aws-cdk-lib
new MyStack(app, 'MyStack', {
  environmentName: 'Cloudmap',
  vpcCidr: '10.0.0.0/16',
  ecsClusterName: 'cloudmapcluster',
  ecsServiceName: 'cloudmapservice',
  taskDefinitionName: 'flask-ecsfargate-td',
  image: 'YOUR-IMAGE-URL', // Paste your image url
  serviceName: 'fargate-service',
  containerPort: 80,
  ecsExecutionRole: 'ExecutionRole',
  ecsTaskRole: 'TaskRole',
  vpcLinkName: 'vpc-link-fargate',
  apiName: 'api-gateway',
  namespaceName: 'fargate-ns',
  env: {
    region: 'eu-west-1',
  },
});
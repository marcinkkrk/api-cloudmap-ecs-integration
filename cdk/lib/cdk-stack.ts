import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { HttpApi, CorsHttpMethod, HttpMethod, VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpServiceDiscoveryIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

interface MyStackProps extends StackProps {
  environmentName: string;
  vpcCidr: string;
  ecsClusterName: string;
  ecsServiceName: string;
  taskDefinitionName: string;
  image: string;
  serviceName: string;
  containerPort: number;
  ecsExecutionRole: string;
  ecsTaskRole: string;
  vpcLinkName: string;
  apiName: string;
  namespaceName: string;
}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);

    // Create VPC with private subnets
    const vpc = new ec2.Vpc(this, 'VPC', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
      enableDnsSupport: true,
      enableDnsHostnames: true,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: `${props.environmentName}-PrivateSubnet`,
          cidrMask: 24,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Security group setup
    const securityGroup = new ec2.SecurityGroup(this, 'CloudmapSG', {
      vpc,
      securityGroupName: `${props.environmentName}-SecurityGroup`,
      description: `${props.environmentName} Security Group`,
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(props.containerPort),
      'Allow HTTP'
    );
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpcCidr),
      ec2.Port.allTraffic(),
      'Allow all traffic from VPC CIDR'
    );

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: props.ecsClusterName,
      vpc,
    });

    // IAM Roles
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      roleName: props.ecsExecutionRole,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: props.ecsTaskRole,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    // ECS Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: props.taskDefinitionName,
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole,
      taskRole,
    });

    taskDefinition.addContainer('AppContainer', {
      containerName: props.serviceName,
      image: ecs.ContainerImage.fromRegistry(props.image),
      portMappings: [{ containerPort: props.containerPort }],
    });

    // VPC Endpoints
    new ec2.InterfaceVpcEndpoint(this, 'ECRdkrEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
      securityGroups: [securityGroup],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    new ec2.InterfaceVpcEndpoint(this, 'ECRapiEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
      securityGroups: [securityGroup],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    new ec2.InterfaceVpcEndpoint(this, 'CWLogsEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
      securityGroups: [securityGroup],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    new ec2.GatewayVpcEndpoint(this, 'S3Endpoint', {
      vpc,
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    // Define Service Discovery Namespace
    const namespace = new servicediscovery.PrivateDnsNamespace(this, 'ServiceDiscoveryNamespace', {
      name: props.namespaceName,
      vpc,
    });

    // Define ECS Service
    const ecsService = new ecs.FargateService(this, 'ECSService', {
      cluster,
      taskDefinition,
      serviceName: props.serviceName,
      desiredCount: 1,
      securityGroups: [securityGroup],
      assignPublicIp: false,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      enableECSManagedTags: true,
      cloudMapOptions: {
        cloudMapNamespace: namespace,
        name: props.ecsServiceName,
        dnsRecordType: servicediscovery.DnsRecordType.SRV,
        containerPort: props.containerPort,
        dnsTtl: cdk.Duration.seconds(60),
      },
    });

    // Define VPC Link
    const vpcLink = new VpcLink(this, 'VpcLink', {
      vpc,
      vpcLinkName: props.vpcLinkName,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
    });

    // Create Api Gateway
    const api = new HttpApi(this, 'HttpApiGateway', {
      apiName: props.apiName,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.OPTIONS,
          CorsHttpMethod.POST,
        ],
      },
    });

    const importedServiceDiscoveryService = ecsService.cloudMapService!;

    const serviceDiscoveryIntegration = new HttpServiceDiscoveryIntegration(
      'ServiceDiscoveryIntegration',
      importedServiceDiscoveryService,
      {
        vpcLink,
        method: HttpMethod.ANY,
      }
    );

    api.addRoutes({
      path: '/',
      methods: [HttpMethod.POST, HttpMethod.GET],
      integration: serviceDiscoveryIntegration,
    });
  }
}

import * as cdk from '@aws-cdk/core'
import * as ecs from '@aws-cdk/aws-ecs'
import {FargatePlatformVersion} from '@aws-cdk/aws-ecs'
import * as ec2 from '@aws-cdk/aws-ec2'
import {DnsRecordType, NamespaceType} from '@aws-cdk/aws-servicediscovery'
import * as path from "path";
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2'
import * as appmesh from '@aws-cdk/aws-appmesh';
import * as ecr from '@aws-cdk/aws-ecr';
import * as iam from '@aws-cdk/aws-iam';


// source: https://docs.aws.amazon.com/app-mesh/latest/userguide/envoy.html
const envoyTag = 'v1.15.1.0-prod'

function envoyImageArn(region: string) {
    switch (region) {
        case 'ap-east-1':
            return 'arn:aws:ecr:ap-east-1:856666278305:repository/aws-appmesh-envoy'
        case 'eu-south-1':
            return 'arn:aws:ecr:eu-south-1:422531588944:repository/aws-appmesh-envoy'
        case 'me-south-1':
            return 'arn:aws:ecr:me-south-1:772975370895:repository/aws-appmesh-envoy'
        default:
            return `arn:aws:ecr:${region}:840364872350:repository/aws-appmesh-envoy`
    }
}


export interface FargateClusterProps {
    vpc: ec2.Vpc
    mesh: appmesh.Mesh
    gateway: appmesh.VirtualGateway
    gatewayName: string
}


export class FargateCluster extends cdk.Construct {
    readonly gateway: ECSAppMeshVirtualGateway

    constructor(parent: cdk.Construct, name: string, props: FargateClusterProps) {
        super(parent, name);

        const cluster = new ecs.Cluster(this, 'cluster', {
            vpc: props.vpc,
            containerInsights: true,
            defaultCloudMapNamespace: {
                name: "default.flb",
                type: NamespaceType.DNS_PRIVATE,
                vpc: props.vpc
            }
        })

        // health checks for all services
        const healthCheck = {
            command: [
                'curl localhost:5000'
            ],
            startPeriod: cdk.Duration.seconds(10),
            interval: cdk.Duration.seconds(5),
            timeout: cdk.Duration.seconds(2),
            retries: 3
        };

        // logging for all mesh services
        const logging = new ecs.AwsLogDriver({
            streamPrefix: props.mesh.meshName
        })

        const commonTaskRole = new iam.Role(this, 'flbECSTaskIamRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        commonTaskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSAppMeshEnvoyAccess'));

        // deploy virtual gateway service
        this.gateway = new ECSAppMeshVirtualGateway(this, props.gatewayName, {
            cluster,
            mesh: props.mesh,
            taskRole: commonTaskRole
        })

        let bookingService = new ECSAppMeshService(this, 'booking', {
            cluster: cluster,
            mesh: props.mesh,
            port: 5000,
            gateway: this.gateway,
            container: {
                image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../services', 'booking')),
                healthCheck: healthCheck,
                memoryLimitMiB: 128,
                logging,
            },
            taskRole: commonTaskRole,
            public: true
        })

        // add virtual gateway route to booking service
        props.gateway.addGatewayRoute('booking-route', {
            gatewayRouteName: 'booking-route',
            routeSpec: appmesh.GatewayRouteSpec.http({
                match: {
                    prefixPath: '/booking'
                },
                routeTarget: bookingService.virtualService,
            })
        })
    }
}


interface ECSAppMeshGatewayProps {
    cluster: ecs.Cluster,
    mesh: appmesh.Mesh,
    taskRole?: iam.Role
}


class ECSAppMeshVirtualGateway extends cdk.Construct {
    readonly service: ecs.FargateService
    readonly nlb: elbv2.NetworkLoadBalancer

    constructor(scope: cdk.Construct, name: string, props: ECSAppMeshGatewayProps) {
        super(scope, name)

        const appMeshRepository = ecr.Repository.fromRepositoryArn(this, 'appmesh-envoy', envoyImageArn(cdk.Stack.of(this).region))

        let taskDefinition = new ecs.FargateTaskDefinition(this, `${name}-task-definition`, {
            taskRole: props.taskRole
        });
        let stack = cdk.Stack.of(this)
        let envoyContainerDefinition = taskDefinition.addContainer('envoy', {
            image: ecs.ContainerImage.fromEcrRepository(appMeshRepository, envoyTag),
            essential: true,
            environment: {
                APPMESH_RESOURCE_ARN: `arn:aws:appmesh:${stack.region}:${stack.account}:mesh/${props.mesh.meshName}/virtualGateway/${name}`,
            },
            healthCheck: {
                command: [
                    'CMD-SHELL',
                    'curl -s http://localhost:9901/server_info | grep state | grep -q LIVE'
                ],
                startPeriod: cdk.Duration.seconds(10),
                interval: cdk.Duration.seconds(5),
                timeout: cdk.Duration.seconds(2),
                retries: 3
            },
            memoryLimitMiB: 128,
            user: '1337',
            logging: new ecs.AwsLogDriver({
                streamPrefix: `${name}-envoy`
            }),
        })
        envoyContainerDefinition.addPortMappings({
            containerPort: 8080,
            protocol: ecs.Protocol.TCP
        })

        this.service = new ecs.FargateService(this, `${name}-service`, {
            cluster: props.cluster,
            desiredCount: 1,
            taskDefinition: taskDefinition,
            cloudMapOptions: {
                dnsRecordType: DnsRecordType.A,
                dnsTtl: cdk.Duration.seconds(10),
                failureThreshold: 2,
                name: name,
            },
            // securityGroups: [], // TODO need to provision service SG that accepts inbound from VPC Link for gateway accessible service
            vpcSubnets: {
                availabilityZones: ['ap-east-1b', 'ap-east-1c'],
                subnetType: ec2.SubnetType.PRIVATE
            },
            platformVersion: FargatePlatformVersion.VERSION1_4
        })
        this.service.connections.allowFromAnyIpv4(ec2.Port.tcp(8080), 'Gateway Port')

        let lbTarget = this.service.loadBalancerTarget({
            containerName: 'envoy',
            protocol: ecs.Protocol.TCP,
            containerPort: 8080
        })

        let scaling = this.service.autoScaleTaskCount({maxCapacity: 3});
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 50,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        })

        // Last but not least setup a load balancer for
        // exposing AppMesh services to the outside world
        this.nlb = new elbv2.NetworkLoadBalancer(this, `${name}-ingress`, {
            vpc: props.cluster.vpc,
            internetFacing: false,
            vpcSubnets: {subnetType: ec2.SubnetType.PRIVATE}
        });
        const listener = this.nlb.addListener('HTTPListener', {port: 80, protocol: elbv2.Protocol.TCP});
        listener.addTargets('gateway', {
            port: 8080,
            targets: [lbTarget]
        });

        new cdk.CfnOutput(this, `${name}-ingress-dns`, {
            exportName: `${name}-ingress-dns`,
            value: this.nlb.loadBalancerDnsName
        });
    }
}


interface ECSAppMeshServiceProps {
    cluster: ecs.Cluster
    mesh: appmesh.Mesh
    gateway: ECSAppMeshVirtualGateway
    container: ecs.ContainerDefinitionOptions
    port: number
    /** whether the service is publicly available through the Virtual Gateway */
    public: boolean
    taskRole?: iam.Role
}


class ECSAppMeshService extends cdk.Construct {
    readonly serviceName: string
    readonly portNumber: number
    readonly service: ecs.FargateService
    readonly virtualNode: appmesh.VirtualNode
    // readonly virtualRouter: appmesh.VirtualRouter
    readonly virtualService: appmesh.VirtualService


    constructor(scope: cdk.Construct, name: string, props: ECSAppMeshServiceProps) {
        super(scope, name);

        const appMeshRepository = ecr.Repository.fromRepositoryArn(this, 'appmesh-envoy', envoyImageArn(cdk.Stack.of(this).region))
        this.portNumber = props.port
        this.serviceName = name

        let taskDefinition = new ecs.FargateTaskDefinition(this, `${name}-task-definition`, {
            taskRole: props.taskRole,
            proxyConfiguration: new ecs.AppMeshProxyConfiguration({
                containerName: 'envoy',
                properties: {
                    appPorts: [this.portNumber],
                    proxyEgressPort: 15001,
                    proxyIngressPort: 15000,
                    ignoredUID: 1337,
                    egressIgnoredIPs: [
                        '169.254.170.2',
                        '169.254.169.254'
                    ]
                }
            })
        });

        let stack = cdk.Stack.of(this)
        let appContainer = taskDefinition.addContainer('app', props.container);
        let envoyContainerDefinition = taskDefinition.addContainer('envoy', {
            image: ecs.ContainerImage.fromEcrRepository(appMeshRepository, envoyTag),
            essential: true,
            environment: {
                APPMESH_RESOURCE_ARN: `arn:aws:appmesh:${stack.region}:${stack.account}:mesh/${props.mesh.meshName}/virtualNode/${name}`,
            },
            healthCheck: {
                command: [
                    'CMD-SHELL',
                    'curl -s http://localhost:9901/server_info | grep state | grep -q LIVE'
                ],
                startPeriod: cdk.Duration.seconds(10),
                interval: cdk.Duration.seconds(5),
                timeout: cdk.Duration.seconds(2),
                retries: 3
            },
            memoryLimitMiB: 128,
            user: '1337',
            logging: new ecs.AwsLogDriver({
                streamPrefix: `${name}-envoy`
            })
        })
        appContainer.addContainerDependencies({
            container: envoyContainerDefinition,
            condition: ecs.ContainerDependencyCondition.HEALTHY,
        })
        appContainer.addPortMappings({
            containerPort: this.portNumber,
        })

        this.service = new ecs.FargateService(this, 'service', {
            cluster: props.cluster,
            desiredCount: 1,
            taskDefinition: taskDefinition,
            cloudMapOptions: {
                dnsRecordType: DnsRecordType.A,
                dnsTtl: cdk.Duration.seconds(10),
                failureThreshold: 2,
                name: name,
            },
            vpcSubnets: {
                availabilityZones: ['ap-east-1b', 'ap-east-1c'],
                subnetType: ec2.SubnetType.PRIVATE
            },
            platformVersion: FargatePlatformVersion.VERSION1_4
        })

        let scaling = this.service.autoScaleTaskCount({maxCapacity: 3});
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 50,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        })

        // Create a virtual node for the name service
        this.virtualNode = new appmesh.VirtualNode(this, `${name}-virtual-node`, {
            mesh: props.mesh,
            virtualNodeName: name,
            serviceDiscovery: appmesh.ServiceDiscovery.cloudMap({
                service: this.service.cloudMapService!
            }),
            listeners: [appmesh.VirtualNodeListener.http({
                port: this.portNumber,
                healthCheck: {
                    healthyThreshold: 2,
                    interval: cdk.Duration.seconds(5), // minimum
                    path: '/',
                    port: this.portNumber,
                    protocol: appmesh.Protocol.HTTP,
                    timeout: cdk.Duration.seconds(2),
                    unhealthyThreshold: 2
                }
            })],
        })

        // // useful only for deploying multi-versions without rewrites currently
        // this.virtualRouter = new appmesh.VirtualRouter(this, `${name}-virtual-router`, {
        //     mesh: props.mesh,
        //     listeners: [appmesh.VirtualRouterListener.http()],
        //     virtualRouterName: `${name}-router`
        // })

        // Create virtual service to make the virtual node accessible
        this.virtualService = new appmesh.VirtualService(this, `${name}-virtual-service`, {
            mesh: props.mesh,
            virtualNode: this.virtualNode,
            virtualServiceName: `${name}.${props.cluster.defaultCloudMapNamespace!.namespaceName}`,
        })

        // if public, ensuring reachable by gateway
        if (props.public) {
            this.service.connections.allowFrom(props.gateway.service, new ec2.Port({
                protocol: ec2.Protocol.TCP,
                stringRepresentation: `Inbound from Gateway`,
                fromPort: this.portNumber,
                toPort: this.portNumber
            }))
        }
    }

    connectToMeshService(appMeshService: ECSAppMeshService) {
        // TODO when connecting to other service, we want to set the other service's inbound SG to allow this service
        //   to their service port

        // let trafficPort = new ec2.Port({
        //     protocol: ec2.Protocol.TCP,
        //     stringRepresentation: `Outbound to ${appMeshService.serviceName}`,
        //     fromPort: appMeshService.portNumber,
        //     toPort: appMeshService.portNumber
        // })
        //
        // // Adjust security group to allow traffic from this app mesh enabled service
        // // to the other app mesh enabled service.
        // this.service.connections.allowTo(appMeshService.service, trafficPort, `Outbound traffic from ${this.serviceName} to ${appMeshService.serviceName}`)
        //
        // // Now adjust this app mesh service's virtual node to add a backend
        // // that is the other service's virtual service
        // this.virtualNode.addBackend(appMeshService.virtualService)
    }
}
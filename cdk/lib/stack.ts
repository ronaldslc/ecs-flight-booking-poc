import * as cdk from '@aws-cdk/core'
import {StaticSite} from './static-site'
import {VPC} from './network'
import {FargateCluster} from './fargate'
import * as appmesh from '@aws-cdk/aws-appmesh';
import {RestGateway} from "./api-gateway";
import {EndpointType} from "@aws-cdk/aws-apigateway";

export class Stack extends cdk.Stack {
    env: string = 'dev'

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new VPC(this, 'vpc', {
            env: this.env
        })

        const ui = new StaticSite(this, 'web', {
            bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED
        })

        let mesh = new appmesh.Mesh(this, 'mesh', {
            meshName: 'flbMesh'
        })

        let meshGatewayName = 'flb-gateway'
        let meshGateway = new appmesh.VirtualGateway(this, 'mesh-gateway', {
            mesh: mesh,
            accessLog: appmesh.AccessLog.fromFilePath('/dev/stdout'),
            listeners: [appmesh.VirtualGatewayListener.http({
                port: 8080,
                healthCheck: {
                    interval: cdk.Duration.seconds(10),
                },
            })],
            virtualGatewayName: meshGatewayName,
        })

        const fargate = new FargateCluster(this, 'fargate', {
            vpc: vpc.vpc,
            mesh,
            gateway: meshGateway,
            gatewayName: meshGatewayName
        })

        const apiGateway = new RestGateway(this, 'api', {
            endpointType: EndpointType.REGIONAL,
            corsOrigins: ['*'],
            vpc: vpc.vpc,
            nlb: fargate.gateway.nlb,
            apiName: 'flb',
        })
    }
}

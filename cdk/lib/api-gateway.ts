import * as cdk from '@aws-cdk/core'
import * as apiGateway from '@aws-cdk/aws-apigatewayv2'
import * as restGateway from '@aws-cdk/aws-apigateway'
import {PassthroughBehavior} from '@aws-cdk/aws-apigateway'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2'

export * from '@aws-cdk/aws-apigatewayv2'


export interface GatewayProps {
    readonly apiName: string
    readonly corsOrigins: string[]
    readonly vpc: ec2.Vpc
}


export class Gateway extends cdk.Construct {
    public readonly api: apiGateway.HttpApi;

    constructor(scope: cdk.Construct, id: string, props: GatewayProps) {
        super(scope, id);

        this.api = new apiGateway.HttpApi(this, "api", {
            apiName: props.apiName,
            corsPreflight: {
                allowHeaders: ['Authorization'],
                allowMethods: [apiGateway.HttpMethod.GET, apiGateway.HttpMethod.HEAD, apiGateway.HttpMethod.OPTIONS, apiGateway.HttpMethod.POST],
                maxAge: cdk.Duration.days(1),
                allowOrigins: props.corsOrigins,
            },
        })
    }

    public addRoutes(path: string, integration: apiGateway.IHttpRouteIntegration, methods: apiGateway.HttpMethod[] = [apiGateway.HttpMethod.GET]) {
        let routes = this.api.addRoutes({
            methods: methods,
            path: path,
            integration: integration
        })

        new cdk.CfnOutput(this, 'Routes', {value: routes[0].toString()})
    }
}


export interface RestGatewayProps {
    readonly apiName: string
    readonly corsOrigins: string[]
    readonly vpc: ec2.Vpc
    readonly endpointType: restGateway.EndpointType
    readonly nlb: elbv2.NetworkLoadBalancer
}


export class RestGateway extends cdk.Construct {
    public readonly api: restGateway.RestApi;
    public readonly privateIntegration: restGateway.Integration

    constructor(scope: cdk.Construct, id: string, props: RestGatewayProps) {
        super(scope, id);

        this.api = new restGateway.RestApi(this, props.apiName, {
            restApiName: props.apiName,
            endpointTypes: [props.endpointType],
            defaultCorsPreflightOptions: {
                allowHeaders: ['Authorization'],
                allowMethods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
                maxAge: cdk.Duration.days(1),
                allowOrigins: props.corsOrigins,
            },
        })

        let link = new restGateway.VpcLink(cdk.Stack.of(this), 'gatewayLink', {
            targets: [props.nlb],
            vpcLinkName: 'apiGatewayECSLink',
        })

        this.privateIntegration = new restGateway.Integration({
            type: restGateway.IntegrationType.HTTP_PROXY,
            options: {
                connectionType: restGateway.ConnectionType.VPC_LINK,
                vpcLink: link,
                passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
                requestParameters: {
                    'integration.request.path.proxy': 'method.request.path.proxy'
                },
            },
            integrationHttpMethod: 'ANY',
            uri: `http://${props.nlb.loadBalancerDnsName}/{proxy}`
        });

        let resource = this.api.root.addResource('{proxy+}')
        resource.addMethod('ANY', this.privateIntegration, {
            methodResponses: [{
                statusCode: '200',
            }],
            requestParameters: {
                'method.request.path.proxy': true
            },
        })
    }
}
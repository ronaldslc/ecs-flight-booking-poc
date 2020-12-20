import * as cdk from '@aws-cdk/core'
import * as ec2 from '@aws-cdk/aws-ec2'


export interface VPCProps {
    env: string;
}


/**
 * VPC and subnets to host the project with
 */
export class VPC extends cdk.Construct {
    readonly vpc: ec2.Vpc

    constructor(parent: cdk.Construct, name: string, props: VPCProps) {
        super(parent, name);

        this.vpc = new ec2.Vpc(this, `flb`, {
            cidr: '10.0.0.0/16',
            enableDnsHostnames: true,
            enableDnsSupport: true,
            maxAzs: 3,
            natGateways: 1,
            natGatewaySubnets: {
                subnetType: ec2.SubnetType.PUBLIC
            },
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'application',
                    subnetType: ec2.SubnetType.PRIVATE,
                },
                {
                    cidrMask: 28,
                    name: 'db',
                    subnetType: ec2.SubnetType.ISOLATED,
                }
            ]
        });

        cdk.Tags.of(this.vpc).add('Environment', props.env)
    }
}
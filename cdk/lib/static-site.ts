import s3 = require('@aws-cdk/aws-s3');
import s3deploy = require('@aws-cdk/aws-s3-deployment');
import cdk = require('@aws-cdk/core');


export interface StaticSiteProps {
    bucketName: string;
}


/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 */
export class StaticSite extends cdk.Construct {
    constructor(parent: cdk.Construct, name: string, props: StaticSiteProps) {
        super(parent, name);

        // Content bucket
        const siteBucket = new s3.Bucket(this, 'SiteBucket', {
            bucketName: props.bucketName,
            websiteIndexDocument: 'index.html',
            publicReadAccess: true,
            encryption: s3.BucketEncryption.S3_MANAGED,

            // The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
            // the new bucket, and it will remain in your account until manually deleted. By setting the policy to
            // DESTROY, cdk destroy will attempt to delete the bucket, but will error if the bucket is not empty.
            removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
        });
        new cdk.CfnOutput(this, 'Bucket', {value: siteBucket.bucketName});
        new cdk.CfnOutput(this, 'BucketURL', {value: siteBucket.bucketWebsiteUrl});

        // Deploy site contents to S3 bucket
        new s3deploy.BucketDeployment(this, 'web', {
            sources: [s3deploy.Source.asset('../ui/web/build')],
            destinationBucket: siteBucket,
            retainOnDelete: false // NOT recommended for production code
        });
    }
}

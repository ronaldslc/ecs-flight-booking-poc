This is a proof of concept to deploy a microservices architecture
on AWS ECS Fargate, with a React FrontEnd that uses API Gateway (REST API)
deployed using AWS CDK developed CloudFormation template with containers
built and uploaded to AWS ECR.

This setup allows the use of X-Ray and WAF and only a single, high performance
NLB



NOTES:
- Virtual Gateway through AppMesh *does* rewrite routes ((https://docs.aws.amazon.com/app-mesh/latest/userguide/virtual_gateways.html))
  so each "microservice" can adhere better to DDD subdomain by utilising its own bounded context with a clean REST API 
- API Gateway (HTTP API) VPC Link currently does not work for all AZs AND the subnets selector does not work (https://github.com/aws/aws-cdk/issues/12083)
  so if the region's AZ-1 is not working for you, it just won't work
- API Gateway (HTTP API) through Cloud Map integrator will NOT work with X-Ray, WAF (Supposed to be WIP)
- API Gateway (HTTP API) cannot rewrite paths, so services must be able to handle
  expected API Gateway paths
- Cloud Map service *does* get load balanced through API Gateway even without a load balancer (which is possible when using HTTP API)
- Destroying of this CDK currently does not work properly 

## Instructions
Initial Setup
```bash
docker build docker/awsctrl -t awsctrl
docker-compose -p awsctrl -f docker/awsctrl/docker-compose.yml up -d
docker exec -it awsctrl /bin/bash
aws configure
cd cdk && cdk deploy
```

Re-runs
```bash
docker-compose -p awsctrl -f docker/awsctrl/docker-compose.yml up -d
docker exec -it awsctrl /bin/bash
cd cdk && cdk deploy
```
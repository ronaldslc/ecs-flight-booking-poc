FROM amazon/aws-cli
RUN yum install -y which &&\
    curl -sL https://rpm.nodesource.com/setup_12.x | bash - &&\
    yum install -y nodejs &&\
    npm install -g aws-cdk &&\
    amazon-linux-extras install -y docker &&\
    echo "complete -C '/usr/local/bin/aws_completer' aws" >> ~/.bashrc

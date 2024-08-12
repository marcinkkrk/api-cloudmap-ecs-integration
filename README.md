# api-cloudmap-ecs-integration
![screenshot](Diagram.png)

1. Create ECR repository
2. Using Push commands from this repository build, tag and push image from flask-app
3. Paste image URI to cdk/bin/cdk.ts -> image
4. There you can customize your resources names and values also
4. cdk deploy (from cdk folder!)
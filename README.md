# Next.js High-Availability Deployment on AWS

This project deploys a Next.js application on AWS using two EC2 instances in private subnets behind an internet-facing Application Load Balancer (ALB). The architecture provides redundancy across two Availability Zones and keeps the application servers inaccessible directly from the internet.

## Architecture

```text
                                  ┌────────────────────┐
                                  │    User Browser    │
                                  └─────────┬──────────┘
                                            │
                                            │ HTTP request
                                            │ TCP port 80
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                            AWS Region: us-east-1                               │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │                                VPC                                       │ │
│  │                                                                          │ │
│  │  ┌────────────────────────────┐        ┌────────────────────────────┐   │ │
│  │  │     Public Subnet A        │        │     Public Subnet B        │   │ │
│  │  │       us-east-1a           │        │       us-east-1b           │   │ │
│  │  │                            │        │                            │   │ │
│  │  │  ┌──────────────────────┐  │        │  ┌──────────────────────┐  │   │ │
│  │  │  │ Internet-facing ALB  │  │        │  │     NAT Gateway      │  │   │ │
│  │  │  │ nextjs-alb           │  │        │  │                      │  │   │ │
│  │  │  │ HTTP Listener :80    │──┼────────┼──► Outbound internet     │  │   │ │
│  │  │  └──────────┬───────────┘  │        │  │ access for private   │  │   │ │
│  │  └─────────────┼──────────────┘        │  │ EC2 instances        │  │   │ │
│  │                │                        │  └──────────┬───────────┘  │   │ │
│  │                ▼                        └─────────────┼──────────────┘   │ │
│  │  ┌─────────────────────────────────────────────────────┼──────────────┐   │ │
│  │  │              Target Group: nextjs-tg                │              │   │ │
│  │  │        Routes traffic to healthy EC2 targets        │              │   │ │
│  │  └───────────────┬─────────────────────────┬───────────┼──────────────┘   │ │
│  │                  │                         │           │                  │ │
│  │                  ▼                         ▼           │                  │ │
│  │  ┌────────────────────────────┐        ┌──────────────┴───────────────┐   │ │
│  │  │     Private Subnet A       │        │      Private Subnet B         │   │ │
│  │  │       us-east-1a           │        │       us-east-1b              │   │ │
│  │  │                            │        │                               │   │ │
│  │  │  ┌──────────────────────┐  │        │  ┌──────────────────────┐     │   │ │
│  │  │  │ EC2: next-web-1      │  │        │  │ EC2: next-web-2      │     │   │ │
│  │  │  │ Next.js application  │  │        │  │ Next.js application  │     │   │ │
│  │  │  │ Node.js + pnpm       │  │        │  │ Node.js + pnpm       │     │   │ │
│  │  │  │ Application port 3000│  │        │  │ Application port 3000│     │   │ │
│  │  │  └──────────────────────┘  │        │  └──────────────────────┘     │   │ │
│  │  └────────────────────────────┘        └───────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Request flow

1. A user sends an HTTP request to the ALB DNS name.
2. The ALB receives the request on port 80.
3. The ALB forwards the request to the target group.
4. The target group routes the request to a healthy EC2 instance.
5. The selected EC2 instance serves the Next.js application.
6. The response is returned to the user through the ALB.

## Components

| Component | Purpose |
|---|---|
| **Application Load Balancer** | Single public entry point for incoming HTTP traffic |
| **HTTP listener** | Accepts user traffic on port 80 |
| **Target group** | Distributes requests across healthy EC2 instances |
| **EC2 instances** | Run the Next.js application |
| **Launch template** | Defines the AMI, instance type, key pair, security group, and user data |
| **User data** | Installs dependencies, builds the Next.js app, and starts the application service |
| **Private subnets** | Prevent direct internet access to the EC2 instances |
| **NAT Gateway** | Provides outbound internet access for private EC2 instances |
| **Internet Gateway** | Connects the VPC to the internet |
| **Security groups** | Control inbound and outbound traffic |

## Networking

### Inbound user traffic

```text
User Browser
     │
     ▼
Application Load Balancer
     │
     ▼
Target Group
     │
     ▼
Private EC2 instances
```

The NAT Gateway is not part of the inbound user-traffic path.

### Outbound instance traffic

```text
Private EC2 instances
     │
     ▼
NAT Gateway
     │
     ▼
Internet Gateway
     │
     ▼
Internet
```

The NAT Gateway allows the EC2 instances to download packages, install dependencies, and access external services during deployment.

## Security groups

```text
Internet
   │
   ▼
ALB security group
   Inbound: TCP 80 from 0.0.0.0/0
   │
   ▼
EC2 security group
   Inbound: TCP 80 only from the ALB security group
   │
   ▼
Next.js application
```

- The ALB accepts HTTP traffic from the internet.
- The EC2 instances accept traffic only from the ALB.
- Users cannot connect directly to the EC2 instances.
- SSH access should be restricted to a trusted IP address.

## High availability

The application runs on two EC2 instances in separate Availability Zones:

| Instance | Availability Zone | Role |
|---|---|---|
| `next-web-1` | `us-east-1a` | Active Next.js application server |
| `next-web-2` | `us-east-1b` | Active Next.js application server |

If one instance becomes unhealthy or unavailable, the ALB stops sending traffic to it and routes requests to the remaining healthy instance.

## Deployment process

1. Create a launch template containing the AMI, instance type, key pair, security group, and user data.
2. Launch EC2 instances from the launch template.
3. Register the instances with the ALB target group.
4. Wait until both targets report `healthy`.
5. Access the application through the ALB DNS name.

## Application setup

The EC2 user data performs the following tasks:

1. Installs required system packages.
2. Installs Node.js and pnpm.
3. Clones the Next.js application repository.
4. Installs project dependencies using pnpm.
5. Builds the Next.js application.
6. Configures and starts the application as a service.

The application listens internally on port 3000. The ALB forwards user traffic to the instances through the configured target group.

## Access

```text
http://nextjs-alb-1141637684.us-east-1.elb.amazonaws.com
```

## HTTPS

HTTPS is not enabled in the current setup.

To enable HTTPS:

1. Request or import an SSL/TLS certificate in AWS Certificate Manager (ACM).
2. Add an HTTPS listener on port 443 to the ALB.
3. Attach the ACM certificate to the HTTPS listener.
4. Optionally configure the HTTP listener to redirect traffic to HTTPS.

## Cost considerations

The following resources contribute to AWS costs:

- Application Load Balancer
- Two EC2 instances
- NAT Gateway
- Data transfer
- EBS storage

For development or testing, stop or terminate unused EC2 instances and delete the NAT Gateway when it is not needed, since NAT Gateway charges apply even when no traffic is flowing.

## Future improvements

- Add HTTPS using ACM and an ALB HTTPS listener.
- Add a custom domain using Route 53.
- Add an Auto Scaling group for automatic instance replacement and scaling.
- Store application secrets in AWS Systems Manager Parameter Store or AWS Secrets Manager.
- Add CloudWatch alarms for CPU, memory, ALB 5xx errors, and target health.
- Use infrastructure as code with Terraform, AWS CDK, or CloudFormation.

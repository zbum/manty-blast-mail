pipeline {
    agent any

    tools {
        go 'go-1.26'
        nodejs 'nodejs-25.2.1'
    }

    environment {
        REGISTRY = 'registry.manty.co.kr'
        IMAGE = "${REGISTRY}/manty-blast-mail"
        KUBECONFIG = credentials('kubeconfig')
        K8S_NAMESPACE = 'manty-blast-mail'
        DEPLOYMENT_NAME = 'manty-blast-mail'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 15, unit: 'MINUTES')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Frontend Build') {
            steps {
                dir('web') {
                    sh 'npm install'
                    sh 'npm run build'
                }
            }
        }

        stage('Test') {
            steps {
                sh 'go test ./... -v -cover'
            }
        }

        stage('Build Image') {
            steps {
                script {
                    docker.build("${IMAGE}:${BUILD_NUMBER}", ".")
                    docker.build("${IMAGE}:latest", ".")
                }
            }
        }

        stage('Push Image') {
            steps {
                script {
                    docker.withRegistry("https://${REGISTRY}", 'docker-registry-credentials') {
                        docker.image("${IMAGE}:${BUILD_NUMBER}").push()
                        docker.image("${IMAGE}:latest").push()
                    }
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                script {
                    sh """
                        kubectl --kubeconfig=\$KUBECONFIG apply -f k8s/namespace.yaml
                        kubectl --kubeconfig=\$KUBECONFIG apply -f k8s/secret-config.yaml
                        kubectl --kubeconfig=\$KUBECONFIG apply -f k8s/deployment.yaml
                        kubectl --kubeconfig=\$KUBECONFIG apply -f k8s/service.yaml
                        kubectl --kubeconfig=\$KUBECONFIG apply -f k8s/ingress.yaml
                    """

                    sh """
                        kubectl --kubeconfig=\$KUBECONFIG set image deployment/${DEPLOYMENT_NAME} \
                            ${DEPLOYMENT_NAME}=${IMAGE}:${BUILD_NUMBER} \
                            -n ${K8S_NAMESPACE}
                    """

                    sh """
                        kubectl --kubeconfig=\$KUBECONFIG rollout status deployment/${DEPLOYMENT_NAME} \
                            -n ${K8S_NAMESPACE} --timeout=300s
                    """
                }
            }
        }
    }

    post {
        success {
            echo 'Deployment successful!'
        }
        failure {
            echo 'Deployment failed!'
        }
        always {
            cleanWs()
        }
    }
}

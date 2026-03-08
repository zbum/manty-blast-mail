#!/usr/bin/env bash
set -euo pipefail

# Jenkins 서버 정보
JENKINS_URL="${JENKINS_URL:-https://jenkins.manty.co.kr}"
JENKINS_USER="${JENKINS_USER:?JENKINS_USER 환경변수를 설정하세요}"
JENKINS_TOKEN="${JENKINS_TOKEN:?JENKINS_TOKEN 환경변수를 설정하세요}"

JOB_NAME="manty-blast-mail"
GIT_REPO="https://github.com/zbum/manty-blast-mail.git"

# Jenkins Job config.xml
CONFIG_XML=$(cat <<'XMLEOF'
<?xml version='1.1' encoding='UTF-8'?>
<org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject plugin="workflow-multibranch">
  <actions/>
  <description>MantyBlastMail 대량 메일 발송 시스템</description>
  <properties>
    <org.jenkinsci.plugins.pipeline.modeldefinition.config.FolderConfig plugin="pipeline-model-definition">
      <dockerLabel></dockerLabel>
      <registry plugin="docker-commons"/>
    </org.jenkinsci.plugins.pipeline.modeldefinition.config.FolderConfig>
  </properties>
  <folderViews class="jenkins.branch.MultiBranchProjectViewHolder" plugin="branch-api">
    <owner class="org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" reference="../.."/>
  </folderViews>
  <healthMetrics/>
  <icon class="jenkins.branch.MetadataActionFolderIcon" plugin="branch-api">
    <owner class="org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" reference="../.."/>
  </icon>
  <orphanedItemStrategy class="com.cloudbees.hudson.plugins.folder.computed.DefaultOrphanedItemStrategy" plugin="cloudbees-folder">
    <pruneDeadBranches>true</pruneDeadBranches>
    <daysToKeep>-1</daysToKeep>
    <numToKeep>-1</numToKeep>
  </orphanedItemStrategy>
  <triggers/>
  <disabled>false</disabled>
  <sources class="jenkins.branch.MultiBranchProject$BranchSourceList" plugin="branch-api">
    <data>
      <jenkins.branch.BranchSource>
        <source class="jenkins.plugins.git.GitSCMSource" plugin="git">
          <id>manty-blast-mail-git</id>
          <remote>https://github.com/zbum/manty-blast-mail.git</remote>
          <credentialsId></credentialsId>
          <traits>
            <jenkins.plugins.git.traits.BranchDiscoveryTrait/>
          </traits>
        </source>
        <strategy class="jenkins.branch.DefaultBranchPropertyStrategy">
          <properties class="empty-list"/>
        </strategy>
      </jenkins.branch.BranchSource>
    </data>
  </sources>
  <factory class="org.jenkinsci.plugins.workflow.multibranch.WorkflowBranchProjectFactory">
    <owner class="org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" reference="../.."/>
    <scriptPath>Jenkinsfile</scriptPath>
  </factory>
</org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject>
XMLEOF
)

echo "==> Jenkins Job 생성: ${JOB_NAME}"
echo "    Jenkins: ${JENKINS_URL}"
echo "    Git:     ${GIT_REPO}"
echo ""

# Crumb (CSRF protection) 가져오기
echo "==> CSRF Crumb 요청 중..."
CRUMB_RESPONSE=$(curl -sf \
  --user "${JENKINS_USER}:${JENKINS_TOKEN}" \
  "${JENKINS_URL}/crumbIssuer/api/json" 2>/dev/null || true)

CRUMB_HEADER=""
if [ -n "${CRUMB_RESPONSE}" ]; then
  CRUMB_FIELD=$(echo "${CRUMB_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['crumbRequestField'])")
  CRUMB_VALUE=$(echo "${CRUMB_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['crumb'])")
  CRUMB_HEADER="-H ${CRUMB_FIELD}:${CRUMB_VALUE}"
  echo "    Crumb 획득 완료"
else
  echo "    Crumb 불필요 (CSRF 비활성화)"
fi

# Job 존재 여부 확인
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --user "${JENKINS_USER}:${JENKINS_TOKEN}" \
  "${JENKINS_URL}/job/${JOB_NAME}/api/json")

if [ "${HTTP_CODE}" = "200" ]; then
  echo ""
  echo "==> Job '${JOB_NAME}'이 이미 존재합니다. config를 업데이트합니다..."

  TMPFILE=$(mktemp)
  CODE=$(curl -s -o "${TMPFILE}" -w "%{http_code}" \
    --user "${JENKINS_USER}:${JENKINS_TOKEN}" \
    ${CRUMB_HEADER} \
    -X POST \
    -H "Content-Type: application/xml" \
    -d "${CONFIG_XML}" \
    "${JENKINS_URL}/job/${JOB_NAME}/config.xml")

  if [ "${CODE}" = "200" ]; then
    echo "    Job 업데이트 완료!"
  else
    echo "    업데이트 실패 (HTTP ${CODE})"
    cat "${TMPFILE}"
    rm -f "${TMPFILE}"
    exit 1
  fi
  rm -f "${TMPFILE}"
else
  echo ""
  echo "==> Job '${JOB_NAME}' 생성 중..."

  TMPFILE=$(mktemp)
  CODE=$(curl -s -o "${TMPFILE}" -w "%{http_code}" \
    --user "${JENKINS_USER}:${JENKINS_TOKEN}" \
    ${CRUMB_HEADER} \
    -X POST \
    -H "Content-Type: application/xml" \
    -d "${CONFIG_XML}" \
    "${JENKINS_URL}/createItem?name=${JOB_NAME}")

  if [ "${CODE}" = "200" ]; then
    echo "    Job 생성 완료!"
  else
    echo "    생성 실패 (HTTP ${CODE})"
    cat "${TMPFILE}"
    rm -f "${TMPFILE}"
    exit 1
  fi
  rm -f "${TMPFILE}"
fi

echo ""
echo "==> Job URL: ${JENKINS_URL}/job/${JOB_NAME}/"
echo "==> 완료!"

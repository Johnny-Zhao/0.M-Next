#!/bin/sh
set -eu

MAVEN_VERSION=3.9.9
MAVEN_HOME="${HOME}/.m2/wrapper/dists/apache-maven-${MAVEN_VERSION}"
ARCHIVE="${MAVEN_HOME}.zip"

if [ ! -x "${MAVEN_HOME}/bin/mvn" ]; then
  mkdir -p "$(dirname "${MAVEN_HOME}")"
  curl -fsSL "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${MAVEN_VERSION}/apache-maven-${MAVEN_VERSION}-bin.zip" -o "${ARCHIVE}"
  unzip -q -o "${ARCHIVE}" -d "$(dirname "${MAVEN_HOME}")"
  rm -f "${ARCHIVE}"
fi

exec "${MAVEN_HOME}/bin/mvn" "$@"

$ErrorActionPreference = "Stop"

$mavenVersion = "3.9.9"
$distributionRoot = Join-Path $HOME ".m2\wrapper\dists"
$mavenHome = Join-Path $distributionRoot "apache-maven-$mavenVersion"
$mavenCommand = Join-Path $mavenHome "bin\mvn.cmd"

if (-not (Test-Path $mavenCommand)) {
    New-Item -ItemType Directory -Force -Path $distributionRoot | Out-Null
    $archive = Join-Path $distributionRoot "apache-maven-$mavenVersion.zip"
    $url = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$mavenVersion/apache-maven-$mavenVersion-bin.zip"
    Invoke-WebRequest -UseBasicParsing $url -OutFile $archive
    Expand-Archive -Path $archive -DestinationPath $distributionRoot -Force
    Remove-Item $archive
}

& $mavenCommand @args
exit $LASTEXITCODE

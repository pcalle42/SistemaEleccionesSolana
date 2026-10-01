FROM debian@sha256:f3034a6ec3c1205360777c4aae76234998866ad18806ae62b63a3f84ccad782b

ARG CIRCOM_VERSION=2.2.3
ARG CIRCOM_SHA256=85342c7ff332d948df7c0c50ecf201e6129349aef550ce873f3c811b79fe53a3

ADD --checksum=sha256:85342c7ff332d948df7c0c50ecf201e6129349aef550ce873f3c811b79fe53a3 \
  https://github.com/iden3/circom/releases/download/v2.2.3/circom-linux-amd64 \
  /usr/local/bin/circom
RUN chmod 0755 /usr/local/bin/circom \
  && test "$(sha256sum /usr/local/bin/circom | cut -d' ' -f1)" = "$CIRCOM_SHA256" \
  && test "$(circom --version | cut -d' ' -f3)" = "$CIRCOM_VERSION"

ENTRYPOINT ["circom"]

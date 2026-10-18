FROM golang:1.25-bookworm@sha256:3b4a11519ad929d1e1d261a12cff056f0c85b735253d7d861346b9c6f8b36437 AS proxy
WORKDIR /src
COPY agent-rpc/go.mod agent-rpc/go.sum ./
RUN go mod download
COPY agent-rpc/*.go ./
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /agent-rpc .

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
LABEL org.opencontainers.image.source="https://github.com/habicht12/nextflow-codex-adapter"
WORKDIR /opt/nf-agent-codex
COPY CODEX_VERSION ./
RUN apt-get update && apt-get install -y --no-install-recommends bash procps ca-certificates python3 bubblewrap \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global --ignore-scripts "@openai/codex@$(cat CODEX_VERSION)" \
    && npm cache clean --force
RUN ln -s "$(find /usr/local/lib/node_modules/@openai/codex -path '*/bin/codex' -type f)" /usr/local/bin/codex-linux-sandbox
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && npm cache clean --force
COPY *.mjs ./
COPY --from=proxy /agent-rpc /usr/local/bin/agent-rpc
RUN mkdir -p /opt/codex-home
ENV CODEX_HOME=/opt/codex-home
ENTRYPOINT []
CMD ["codex", "--version"]

FROM oven/bun:1-alpine
WORKDIR /app
COPY *.ts ./
RUN bun install
CMD ["bun", "run", "server.ts"]

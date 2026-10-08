FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.mjs /app/server.mjs
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node","/app/server.mjs"]

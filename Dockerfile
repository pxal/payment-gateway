FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY README.md ./
COPY data/.gitkeep ./data/.gitkeep

EXPOSE 1000

CMD ["npm", "start"]

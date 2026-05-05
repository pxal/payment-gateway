FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY src ./src
COPY README.md ./
COPY data/.gitkeep ./data/.gitkeep

EXPOSE 1000

CMD ["npm", "start"]

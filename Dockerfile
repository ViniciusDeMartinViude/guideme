FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
# The bot routes are not enabled in this landing-page deployment. These values
# only let Next evaluate the optional dynamic dashboard routes during its build.
ENV TELEGRAM_BOT_TOKEN=build-placeholder \
    OPENROUTER_API_KEY=build-placeholder \
    EXA_API_KEY=build-placeholder
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["npm", "run", "start"]

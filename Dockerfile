FROM node:24-alpine
WORKDIR /app
RUN npm install --omit=dev --no-audit --no-fund --no-save @aws-sdk/client-sesv2@3.1154.0 @aws-sdk/client-s3@3.1154.0 web-push@3.6.7
COPY --chown=node:node server.mjs monthly-employee-mail.mjs attendance-reminders.mjs loans.mjs payroll.mjs company-credentials.mjs employee-page.mjs admin-auth.mjs storage.mjs push.mjs ./
COPY --chown=node:node public ./public
RUN chown node:node /app
USER node
ENV DAWAMAK_HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]

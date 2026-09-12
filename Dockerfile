FROM apify/actor-node-playwright-chrome:22

COPY --chown=myuser:myuser package.json ./

RUN node -e "const fs = require('fs'); const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')); delete packageJson.devDependencies; fs.writeFileSync('package.json', JSON.stringify(packageJson));" \
    && npm --quiet set progress=false \
    && npm install --omit=dev --no-package-lock --no-audit --no-fund \
    && node -e "import('patchright').then(m => console.log('patchright OK:', Object.keys(m)))" \
    && rm -rf ~/.npm

COPY --chown=myuser:myuser . ./

ENV APIFY_LOG_LEVEL=INFO

CMD npm start --silent
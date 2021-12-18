FROM node:16

# Create app directory
WORKDIR /exobase-builder
RUN mkdir /exobase-builder/deployments
RUN mkdir /exobase-builder/logs

# Add dependency files
COPY package.json .
COPY yarn.lock .

# Install app dependencies
RUN yarn
RUN yarn global add lerna

# Install and setup Pulumi templates
RUN wget "https://github.com/exobase-inc/pulumi-templates/archive/refs/heads/master.zip" -P /exobase-builder
RUN unzip /exobase-builder/master.zip -d /exobase-builder
RUN cd /exobase-builder/pulumi-templates-master && lerna bootstrap

# Bundle app source
COPY src ./src

RUN ls /exobase-builder

ENV WORKING_DIR_ROOT "/exobase-builder/deployments"
ENV PULUMI_TEMPLATES_ROOT "/exobase-builder/pulumi-templates-master"
ENV EXOBASE_LOG_DIR "/exobase-builder/logs"

CMD [ "yarn", "dev" ]

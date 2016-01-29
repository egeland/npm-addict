FROM node:4

ENV NODE_ENV production

RUN apt-get update && apt-get install -y \
  nano

RUN groupadd npmaddict && useradd --create-home --gid=npmaddict npmaddict
COPY . /home/npmaddict/npm-addict
WORKDIR /home/npmaddict/npm-addict
RUN chown --recursive npmaddict:npmaddict .
USER npmaddict

RUN npm install

ENTRYPOINT ["npm", "start"]

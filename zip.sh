#!/bin/bash
zip -r Archive.zip ./* -x Archive.zip -x node_modules/\* -x package.json -x package-lock.json -x node_modules.zip && \
zip -r node_modules.zip nodejs/node_modules && \
aws lambda update-function-code \
    --function-name resize-image \
    --zip-file fileb://Archive.zip && \
echo 'Done.';

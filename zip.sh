#!/bin/bash
zip -r Archive.zip ./* -x Archive.zip && \
aws lambda update-function-code \
    --function-name resize-image \
    --zip-file fileb://Archive.zip && \
echo 'Done.';

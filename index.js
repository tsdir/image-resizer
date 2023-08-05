"use strict";
const stream = require("stream"),
  sharp = require("sharp"),
  mime = require("mime/lite"),
  AWS = require("aws-sdk");

// aws config
AWS.config.update({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
});

//
const s3 = new AWS.S3(),
  sizes = [
    "80x80", // small existing thumb
    "150x150", // new thumb size?
    "200x125", // existing thumb
    "360w", // thumb without height restriction
    "360x270", // larger thumb restricted
    "480w",
    "640w",
    "1280w", // largest web image
  ];

const cdnUrl = new URL(process.env.CDN_URL);

exports.handler = async (event) => {
  // read key from querystring
  const key = event.queryStringParameters.key;
  const key_components = key.split(":");

  // extract file size
  const size = key_components.pop();

  if (sizes.indexOf(size) === -1) {
    return {
      statusCode: 404,
      body: JSON.stringify("Invalid output size."),
    };
  }

  var params = {};

  // process size from given string
  if (size.slice(-1) == "w") {
    // extract width only
    params.width = parseInt(size.slice(0, -1), 10);
  } else if (size.slice(-1) == "h") {
    // extract height only
    params.height = parseInt(size.slice(0, -1), 10);
  } else {
    // extract width & height
    var size_components = size.split("x");

    // if there aren't 2 values, stop here
    if (size_components.length != 2)
      return {
        statusCode: 404,
        body: JSON.stringify("Invalid image size."),
      };

    params = {
      width: parseInt(size_components[0], 10),
      height: parseInt(size_components[1], 10),
    };

    if (isNaN(params.width) || isNaN(params.height))
      return {
        statusCode: 404,
        body: JSON.stringify("Invalid image size."),
      };
  }

  // check if target key already exists
  var target = null;
  await s3
    .headObject({
      Bucket: process.env.BUCKET,
      Key: key,
    })
    .promise()
    .then((res) => (target = res))
    .catch(() => console.log("File doesn't exist."));

  // if file exists and the request is not forced, stop here
  const forced = typeof event.queryStringParameters.force !== "undefined";
  if (target != null && !forced) {
    const location = new URL(cdnUrl);
    location.pathname = `${size}/${key}`;

    // 301 redirect to existing image
    return {
      statusCode: 301,
      headers: {
        location
      },
      body: "",
    };
  }

  try {
    const readStream = getS3Stream(`product-images/${key_components[0]}`);
    const resizeStream = stream2Sharp(params);
    const { writeStream, success } = putS3Stream(`resized/${size}/${key_components[0]}`);

    // trigger stream
    readStream.pipe(resizeStream).pipe(writeStream);

    // wait for the stream
    await success;

    const location = new URL(cdnUrl);
    location.pathname = `resized/${size}/${key_components[0]}`;

    // 301 redirect to new image
    return {
      statusCode: 301,
      headers: {
        location,
      },
      body: "",
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: err.message,
    };
  }
};

const getS3Stream = (key) => {
  return s3
    .getObject({
      Bucket: process.env.BUCKET,
      Key: key,
    })
    .createReadStream();
};

const putS3Stream = (key) => {
  const pass = new stream.PassThrough();
  return {
    writeStream: pass,
    success: s3
      .upload({
        Body: pass,
        Bucket: process.env.BUCKET,
        Key: key,
        ContentType: mime.getType(key),
        // ACL: "public-read",
      })
      .promise(),
  };
};

const stream2Sharp = (params) => {
  return sharp().resize(
    Object.assign(params, {
      withoutEnlargement: true,
    })
  );
};

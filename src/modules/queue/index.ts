/**
 * Author       - SANCHIT JAIN
 * SERVICE USED - AWS SQS
 * PURPOSE      - BASIC QUEUE FUNCTIONALITY WRAPPER ON AWS SQS   
*/

const AWS = require('aws-sdk');
AWS.config.update({region:'ap-south-1'});
const SQS = new AWS.SQS();    

export function getAWSQueue(){
    return SQS;
}

export *  from './controller';



import {
    sendMailToManyRaw, sendRawMailData
} from './modules/sesModule';
import {
    constants
} from './config/constants'
const uuidV1 = require("uuidv1");
import { getCurrentTime } from './util';
const AWS = require('aws-sdk');

const ses = require("node-ses");
let secretName = 'seskey';
let sesKey = 'key';
let sesSecret = 'secret';

AWS.config.update({region:'ap-south-1'});
const SQS = new AWS.SQS(); 

const sns = new AWS.SNS({
    region: 'ap-south-1'
});


const secretClient = new AWS.SecretsManager({
    region: 'ap-south-1'
});

export async function dispatchMail(err, mailingList: string[] = constants.mailingList) {
    console.log("dispatchMail start execution");
    let message: string;
    if (err.hasOwnProperty('message')) {
        message = err.message + err.stack;
    } else {
        message = "UNKNOWN ERROR";
    }

    return new Promise(function (resolve) {
        let content = message;
        let subject = "Error : TASK PRODUCER  @" + getCurrentTime();

        let emailParams = {
            to: mailingList,
            subject: subject,
            content: content,
            contentType: "text/html",
            sender: { name: "NATIVE COMMON - TASK PRODUCER : Error Reporting  @TeamTHB", email: "info@thb.co.in" }
        };
        console.log("emailParams", emailParams);
        sendMailToManyRaw(emailParams, (err, res) => {
            if (err) {
                console.log("An error occured");
            } else {
                console.log("sent successfully");
            }

            resolve({
                err: err,
                result: res
            });
        });
    });
};

export async function sendMail(payload, mailingList: string[] = constants.mailingList) {
    console.log("sendMail start execution");
    return new Promise(function (resolve) {
        let subject = "Error : EVENT MIGRATION FROM ES TO S3";

        let emailParams = {
            to: mailingList,
            subject: subject,
            content: payload.content,
            contentType: "text/html",
            sender: { name: "NATIVE COMMON - TASK PRODUCER : Error Reporting  @TeamTHB", email: "info@thb.co.in" }
        };
        console.log("emailParams", emailParams);
        sendRawMailData(emailParams => {
        });
    });
};


export async function postMail(event){
    return new Promise(async function (resolve) {
       try{
        let content;
        let subject;
        if(event.error){
            subject = " " +  ( process.env.NODE_ENV ||  "dev " ) + " - Error : Capture-Events-Migration" ;
            content = 'METHOD:   ' + event.httpMethod  + '   PATH: ' + event.path + '<br />'+ event.error;
        }else{
            subject = " " +  ( process.env.NODE_ENV ||  "dev " ) + " - Success : Capture-Events-Migration" ;
            content = 'METHOD:   ' + event.httpMethod  + '   PATH: ' + event.path + '<br />'+ event.success;
        }
        let emailParams = {
            to:  constants.emailId,
            subject:  subject,
            content: content,
            contentType: "text/html",
            sender: {
                name: " " +  ( process.env.NODE_ENV || "dev" ) +  "Capture-Events-Migration",
                email: "info@thb.co.in" }
        };

        await sendRawMailPromisified(emailParams);
        resolve({ error: null, result: null });
        return;
       
    } catch (ex) {
            console.log(ex);
            resolve({ error: null, result: null });
            return;
        }

    });
};


async function sendRawMailPromisified (inputParams) {
    return new Promise((resolve, reject) => {
        secretClient.getSecretValue({
            SecretId: secretName
        }, async (err, data) => {
            if (err) {
                console.log('err in get secret key', err);
                return resolve({
                    error: err,
                    result: null
                });
            }
            let secret;
            let decodedBinarySecret;
            if ('SecretString' in data) {
                secret = data.SecretString;
                var parse = JSON.parse(secret);
                sesKey = parse.NODE_SES_KEY;
                sesSecret = parse.NODE_SES_SECRET;
            } else {
                let buff = new Buffer(data.SecretBinary, 'base64');
                decodedBinarySecret = buff.toString('ascii');
                console.log("else cond", decodedBinarySecret);
            }
            
            let client = ses.createClient({
                key: sesKey,
                secret: sesSecret
            });

            let rawMessageBody = getRawMessage(inputParams);
            if (process.env.hasOwnProperty('isLambdaInVpc') && process.env.isLambdaInVpc == '1') {
                return await notifyEmail(inputParams);
            }

            client.sendRawEmail({
                from: inputParams.sender.email,
                rawMessage: rawMessageBody
            }, (err, data, response) => {
                if (err) {
                    console.error(response);
                    console.error(data);
                    resolve({
                        error: err,
                        result: null
                    });
                    return;
                }
                resolve({
                    error: null,
                    result: {
                        response: response,
                        data: data
                    }
                });
                return;
            });
        });
    });
}

function getRawMessage(inputParams) {
    let uid = uuidV1();
    let to_email = inputParams.to;
    let senderName = inputParams.sender.name;
    let from_email = inputParams.sender.email;
    let mail = "From: " + senderName + " <" + from_email + ">\n";
    mail += "To: " + to_email + "\n";
    mail += "Subject: " + inputParams.subject + "\n";
    mail += "MIME-Version: 1.0\n";
    mail += "Content-Type: multipart/mixed; boundary= \"" + uid + "\"\n\n";
    mail += "This is a multi-part message in MIME format.\r\n";
    mail += "--" + uid + "\n";
    mail += "Content-Type: " + inputParams.contentType + "; charset=us-ascii\n\n";
    mail += inputParams.content + "\n\n";
    if (inputParams.sender.attachment) {
        for (let j = 0; j < inputParams.sender.attachment.length; j++) {
            let base64File = inputParams.sender.attachment[j].data;
            let attachmentFileType = inputParams.sender.attachment[j].mimetype;
            let fileName = inputParams.sender.attachment[j].filename;
            mail += "--" + uid + "\n";
            mail += "Content-Type: " + attachmentFileType + ";\n";
            mail += "Content-Disposition: attachment; filename= \"" + fileName + "\"\n";
            mail += "Content-Transfer-Encoding: base64\n\n";
            mail += base64File + "\n\n";
        }
    }
    mail += "--" + uid + "--";
    return mail;
}

async function notifyEmail(inputParams) {
    return ((resolve, reject) => {
        if (!process.env.lambdaServiceName || !constants.lambdaInVpcSnsArnMap[process.env.lambdaServiceName]) {
            console.log(' no lambdaServiceName in ENV VARIABLES  or SNS topic mapping missing ');
            resolve({
                err: null,
                result: null
            });
            return;
        }
        var params = {
            Message: JSON.stringify(inputParams.content),
            Subject: inputParams.subject,
            TopicArn: constants.lambdaInVpcSnsArnMap[process.env.lambdaServiceName]
        }
        try {
            sns.publish(params, (err, data) => {
                if (err) {
                    console.log(`Publish SNS failed. Error: ${JSON.stringify(err)}`);
                }
                resolve({
                    err,
                    result: data
                });
            });
        } catch (err) {
            console.log("email sending to " + params.TopicArn + " failure ");
            console.log(err.stack);
            resolve({
                err,
                result: null
            });
        }
    });
}

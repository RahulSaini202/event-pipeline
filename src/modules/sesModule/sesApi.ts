import ses = require('node-ses');
import uuidV1 = require('uuidv1');
import async = require('async');
import { IListEmailContent, IListMultipleEmailContent } from './sesInterfaces';
import objectHash = require('object-hash');
//import { thbCache, timeUtils } from '@thblib/thb-util';
//import { getMachineInfo } from '../utilsModule/utils';
import { constants } from './constants';
const AWS = require('aws-sdk');
const sns = new AWS.SNS();

let moduleName = 'ses-api';

let sesKey = 'key';
let sesSecret = 'secret';
let client = null;

export function loadSesClient() {
    return new Promise((resolve, reject) => {
        if (process.env.NODE_SES_KEY && process.env.NODE_SES_SECRET) {
            sesKey = process.env.NODE_SES_KEY;
            sesSecret = process.env.NODE_SES_SECRET;
        }
        client = ses.createClient({ key: sesKey, secret: sesSecret });
        return resolve({ error: null, result: null });
    });
}

let errorTeam = ["rajesh@thb.co.in", "mohit@thb.co.in", "akhilesh@thb.co.in"];

export function sendRawMailPromisified(inputParams: IListEmailContent) {
    return new Promise((resolve, reject) => {
        let rawMessageBody = getRawMessage(inputParams);

        if (process.env.hasOwnProperty('isLambdaInVpc') && process.env.isLambdaInVpc == '1') {
            notifyEmail(inputParams, function (err, data) {
                return resolve({ err: err, result: data });
            });
        } else {

            client.sendRawEmail({
                from: inputParams.sender.email
                , rawMessage: rawMessageBody
            }, function (err, data, response) {
                if (err) {
                    console.log("failed to send raw email, error : " + err.message);
                    console.error(response);
                    console.error(data);
                    return resolve({ error: err, result: null });
                }
                return resolve({ error: null, result: { response: response, data: data } });
            });
        }
    });

};

export function sendRawMail(inputParams: IListEmailContent, callback: Function) {
    let rawMessageBody = getRawMessage(inputParams);
    if (process.env.hasOwnProperty('isLambdaInVpc') && process.env.isLambdaInVpc == '1') {
        notifyEmail(inputParams, function (err, data) {
            callback(err, data);
            return;
        });
    } else {
        client.sendRawEmail({
            from: inputParams.sender.email
            , rawMessage: rawMessageBody
        }, function (err, data, response) {
            if (err) {
                console.log("failed to send raw email, error : " + err.message);
                console.error(response);
                console.error(data);
                callback(err, null);
                return;
            }
            callback(false, { response, data });
            return;
        });
    }


    /**
     * https://www.npmjs.com/package/xml2json
     * sample data format, data has messageId which can be used to track delivery of this email.
     * <SendRawEmailResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/">
  <SendRawEmailResult>
    <MessageId>0100015d30cfddd2-03f5f997-594b-42d3-b60e-f5071025191b-000000</MessageId>
  </SendRawEmailResult>
  <ResponseMetadata>
    <RequestId>cb4783ac-6614-11e7-8c6a-c5a23242dffa</RequestId>
  </ResponseMetadata>
</SendRawEmailResponse>
     */
}

function isDebugEmail(inputParams: IListMultipleEmailContent) {
    if (!inputParams || !inputParams.sender || !inputParams.sender.name || !inputParams.sender.email) {
        return false;
    }

    if (inputParams.sender.email == "rajesh@thb.co.in") {
        return true;
    }
    if (inputParams.sender.email == "info@thb.co.in" && inputParams.sender.name.indexOf("Agenda") > -1) {
        return true;
    }
    return false;
}

function isThbEmail(emailAddr: string) {
    if (!emailAddr || emailAddr.indexOf("@thb.co.in") < 0) {
        return false;
    }

    return true;
}

export function sendMailToManyRaw(inputParams: IListMultipleEmailContent, callback) {
    let mailAsyncFunction: any = [];
    let toList = inputParams.to;
    if (isDebugEmail(inputParams)) {
        // inputParams.content += ("<br/>" + getMachineInfo());
    }

    let debugContent = inputParams.content; //+ ("<br/>" + getMachineInfo());
    for (let i = 0; i < toList.length; i++) {
        let override = { to: toList[i], content: isThbEmail(toList[i]) ? debugContent : inputParams.content };
        let params: IListEmailContent = Object.assign({}, inputParams, override);
        // {
        //     to : inputParams.to[i],
        //     emailDetails : 
        // };

        mailAsyncFunction.push(sendRawMail.bind(null, params));
    }
    console.log("in sendMailToManyRaw");
    async.parallel(mailAsyncFunction, function (err, response) {
        console.log('parallel response',response);
        if (err) {
            console.error(err);
            console.log("failed to send raw emails , error : " + err.message);
            if (inputParams.retryCount && inputParams.retryCount > 0) {
                inputParams.retryCount--;
                setTimeout(() => {
                    sendMailToManyRaw(inputParams, callback)
                }, 5000);
                return;
            }
            callback(err, null);
            return;
        }
        console.log("rrrespnse",response);
        inputParams.response = response;
        callback(false, response);
        return;
    });
}

export function sendMail(inputParams: IListEmailContent, callback: Function) {
    console.log('sendMail func start execution', inputParams);
    if (process.env.hasOwnProperty('isLambdaInVpc') && process.env.isLambdaInVpc == '1') {
        notifyEmail(inputParams, function (err, data) {
            callback(err, data);
            return;
        });
    } else {
        client.sendEmail({
            to: inputParams.to
            , from: inputParams.sender.name + " <" + inputParams.sender.email + ">"
            , cc: inputParams.cc
            , bcc: inputParams.bcc
            , subject: inputParams.subject
            , message: inputParams.content
            , altText: inputParams.contentType
        }, function (err, data, response) {
            if (err) {
                console.log("failed to send email, error : " + err.message);
                callback(err, null);
                return;
            }
            console.log("resonse of the mail", response);
            callback(false, { response, data });
            return;
        });
    }

}

function getRawMessage(inputParams: IListEmailContent) {
    console.log('inputParams', inputParams);
    let uid = uuidV1(); //unique boundary
    let to_email = inputParams.to;
    let senderName = (inputParams.sender && inputParams.sender.name)? inputParams.sender.name : '';
    let from_email = (inputParams.sender && inputParams.sender.email)?inputParams.sender.email : '';

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

export function agendaErrorMail(agendaJobName, content) {
    // atleast 3 hours
    const sesEmailGapInMs = process.env.sesEmailGapInMs || 1000 * 3600 * 3;
    let hash = objectHash(content);
    let now = new Date();

    let dateNow = now.toISOString().split('T')[0]; //Get today date in yy/mm/dd

    let subject = "Error in agenda job : " + agendaJobName + ",Dated :" + dateNow;
    let senderEmail = { name: "THB Agenda", email: "info@thb.co.in" };
    let emailPrarams: IListMultipleEmailContent = {
        to: errorTeam,
        subject: subject,
        content: content,
        contentType: "text/html",
        sender: senderEmail
    };

    sendMailToManyRaw(emailPrarams, function (err, response) {
        if (err) {
            console.log("Failed to send mail for agenda job :" + agendaJobName + " ,error: " + err.message);
            return;
        }
        console.log("Sent mail to error team for agenda job :" + agendaJobName);
        return;
    });
}



export async function notifyEmail(inputParams, callback?) {

    if (process.env.lambdaServiceName && constants.lambdaInVpcSnsArnMap[process.env.lambdaServiceName]) {

        var params = {
            Message: JSON.stringify(inputParams.content), /* required */
            Subject: inputParams.subject,
            TopicArn: constants.lambdaInVpcSnsArnMap[process.env.lambdaServiceName]
        };


        try {
            await sns.publish(params).promise();
            console.log("email sending to " + params.TopicArn + " success " + params.Subject);
        } catch (err) {
            console.log("email sending to " + params.TopicArn + " failure ");
            console.log(err.stack);
            callback(err, null);
            return;
        }

        console.log("  ----  EMAIL PARAMS ---- ");
        console.log(JSON.stringify(params));
        callback(null, null);
        return;

    }

    console.log(' no lambdaServiceName in ENV VARIABLES  or SNS topic mapping missing ');

    callback(null, null);
    return;


}


export function sendRawMailData(inputParams){
    return new Promise((resolve, reject) => {
        var AWS = require('aws-sdk'),
        region = "ap-south-1",
        secretName = "seskey",
        secret,
        decodedBinarySecret;
        const sns = new AWS.SNS();
        const ses = require("node-ses");

        var client = new AWS.SecretsManager({
            region: region
        });

        client.getSecretValue({SecretId: secretName}, function(err, data) {
            console.log('error in getSecretValue',err);
            console.log('data in getSecretValue', data);
            if (err) {
                console.log('err in get secret key', err);
            }
            else {
                console.log('data returns', data);
                console.log("parsing")
                if ('SecretString' in data) {
                    secret = data.SecretString;
                    var parse = JSON.parse(secret);
                    sesKey = parse.NODE_SES_KEY;
                    sesSecret = parse.NODE_SES_SECRET;
                    console.log('if cond = ' +  secret + 'sesKey=' + sesKey + 'sesSecret= ' + sesSecret);

                } else {
                    let buff = new Buffer(data.SecretBinary, 'base64');
                    decodedBinarySecret = buff.toString('ascii');
                    console.log("else cond", decodedBinarySecret);
                    
                }
                // if (process.env.NODE_SES_KEY && process.env.NODE_SES_SECRET) {
                //     sesKey = process.env.NODE_SES_KEY;
                //     sesSecret = process.env.NODE_SES_SECRET;
                // }
        
                console.log('sesKey=' + sesKey + 'sesSecret=' + sesSecret);
        
                client = ses.createClient({ key: sesKey, secret: sesSecret });
        
                let rawMessageBody = getRawMessage(inputParams);
                if (process.env.hasOwnProperty('isLambdaInVpc') && process.env.isLambdaInVpc == '1') {
                    notifyEmail(inputParams, function (err, data) {
                        return resolve({ err: err, result: data });
                    });
                }
                else {
                 
                    client.sendRawEmail({
                        from: inputParams.sender.email,
                        rawMessage: rawMessageBody
                    }, function (err, data, response) {
                        if (err) {
                           
                            console.error(response);
                            console.error(data);
                            return resolve({ error: err, result: null });
                        }
                        return resolve({ error: null, result: { response: response, data: data } });
                    });
                }
            }
        });
    });
}
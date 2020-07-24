const AWS = require('aws-sdk');
AWS.config.update({
    region: 'ap-south-1'
});
const docClient = new AWS.DynamoDB.DocumentClient();
import {constants} from './../config/constants';
var moment = require('moment');

export async function saveUnsubscribeDetail(payloadObject){
    console.log("payloadObject - ", JSON.stringify(payloadObject))
    let dynamoObject;
    let tablename;
    if(!payloadObject.channel && !payloadObject.ch){
        return {error:'channel not found', result:null};
    }
    if((payloadObject.channel && payloadObject.channel=='sms') || (payloadObject.ch && payloadObject.ch=='s') || (payloadObject.channel && payloadObject.channel=='s') ||
    (payloadObject.channel && payloadObject.channel=='wa') || (payloadObject.ch && payloadObject.ch=='wa')){
        if(!payloadObject.mobile){
            return {error:'mobile not found', result:null};
        }
        if(payloadObject.appname && payloadObject.appname=='dmr'){
            tablename = process.env.NODE_ENV!='production' ? `${constants.dmrSmsBlockTable}_beta` : constants.dmrSmsBlockTable
        } else {
            tablename = process.env.NODE_ENV!='production' ? `${constants.smsBlockTable}_beta` : constants.smsBlockTable
        }
        dynamoObject = {
            servername: payloadObject.clientname,
            mobile: payloadObject.mobile || null,
            comment: payloadObject.comment || null,
            reason: payloadObject.metainfo.reason,
            createdDate: getCurrentTime(),
            updatedDate:getCurrentTime(),
            isBlock: true,
            userEmail: 'from opt-out link',
        }
    } else {
        if(!payloadObject.email){
            return {error:'mobile not found', result:null};
        }
        if(payloadObject.appname && payloadObject.appname=='dmr'){
            tablename = process.env.NODE_ENV!='production' ? `${constants.dmrEmailBlockTable}_beta` : constants.dmrEmailBlockTable
        } else {
            tablename = process.env.NODE_ENV!='production' ? `${constants.emailBlockTable}_beta` : constants.emailBlockTable
        }
        dynamoObject = {
            servername: payloadObject.clientname,
            email: payloadObject.email || null,
            comment: payloadObject.comment || null,
            reason: payloadObject.metainfo.reason,
            createddate: getCurrentTime(),
            updateddate:getCurrentTime(),
            isBlock: true,
            userEmail: 'from opt-out link',
        }
    }
    
    console.log("dynamoObject - ", JSON.stringify(dynamoObject))
    let infoParams = {
        TableName: tablename,
        Item: dynamoObject
    }
    console.log("infoParams - ", JSON.stringify(infoParams))
    let infoInsert = await writeItem(infoParams);
    console.log("Dynamo write response - ", JSON.stringify(infoInsert))
    if(infoInsert.error) {
        console.error("Failed to insert in dynamo infoInsert.error - ", JSON.stringify(infoInsert.error));
        return {error:infoInsert.error, result:null};
    }

    return {error: null, result: 'success'};
}

export function getCurrentTime() {
    return moment.utc(new Date()).utcOffset("+05:30").format('YYYY-MM-DD HH:mm:ss');
}

export async function writeItem(params: any) { 
    return new Promise < {
        error: any,
        result: any,
        message ? : string
    } > ((resolve, reject) => {
        docClient.put(params, (err, data) => {
            if (err) {
                console.error(`Unable to put item. Error JSON:  ${JSON.stringify(err)}`);
                resolve({
                    error: err,
                    result: null,
                    message: 'failed'
                });
                return;
            }
            resolve({
                error: null,
                result: data,
                message: 'success'
            });
        });
    });
}
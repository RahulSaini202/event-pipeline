//import * as AWS from 'aws-sdk-typescript';

const AWS = require('aws-sdk');

import { ISendBatchMessage, ISendMessage, ISize, IDeleteMessage, IDeleteMultipleMessage, IPullMessage } from '../interface/request/operation';
import { IPullMessageRes } from '../interface';
import { getAWSQueue }  from './../index';

const SQS = getAWSQueue();

//Add Single Message
export async function pushMessage(params : ISendMessage) : Promise<any>{
    //return await SQS.sendMessage(params);
    return new Promise(function (resolve) {
        SQS.sendMessage(params,function(err,result){
            resolve({err : err, result : result});
        });
    });
};

//Add Multiple Messages
export async function pushMultipleMessages(params : ISendBatchMessage) : Promise<any>{
    //return await SQS.sendMessageBatch(params);
    let promises = [];
    
    for(let i = 0 ;  i < params.Entries.length ; ){
        
        var data = params.Entries.slice(i, i + 10);
        
        let newObj : ISendBatchMessage = {
            Entries : data,
            QueueUrl : params.QueueUrl
        }
        
        let promise =  new Promise(function (resolve) {
            SQS.sendMessageBatch(newObj,function(err,result){
                resolve({err : err, result : result});
            });
        });

        promises.push(promise);
        
        i = i + 10;
    
    };   

    return Promise.all(promises);
};

//Messgaes received from Queue
export async function pullMessages(params : IPullMessage) : Promise<any>{
    //return await SQS.receiveMessage(params);
    return new Promise(function (resolve) {
        SQS.receiveMessage(params,function(err,result){
            resolve({err : err, result : result});
        });
    });
};

// Delete Message
export async function deleteMessage(params : IDeleteMessage) : Promise<any>{
    // return await SQS.getQueueAttributes(params);
    return new Promise(function (resolve) {
        SQS.deleteMessage(params,function(err,result){
            resolve({err : err, result : result});
        });
    });
};


// Delete Multiple Messages
export async function deleteMultipleMessages(params : IDeleteMultipleMessage): Promise<any>{
    // return await SQS.getQueueAttributes(params);
    return new Promise(function (resolve) {
        SQS.deleteMessageBatch(params,function(err,result){
            resolve({err : err, result : result});
        });
    });
};

//Size of the  Queue
export async function size(params : ISize) : Promise<any>{
    // return await SQS.getQueueAttributes(params);
    params.AttributeNames  = [ 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible' ]
    return new Promise(function (resolve) {
        SQS.getQueueAttributes(params,function(err,result){
            resolve({err : err, result : result});
        });
    });
};

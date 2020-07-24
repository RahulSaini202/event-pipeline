export interface IReceiveMessageAttributeList{
    QueueUrl                  : string, 
    AttributeNames?           : string[], // default is 'ALL'.
    MaxNumberOfMessages?      : number,  // default is 1.  
    MessageAttributeNames?    : string[], 
    ReceiveRequestAttemptId?  : number,   //only applicable for FIFO
    VisibilityTimeout?        : number,
    WaitTimeSeconds?          : number  
};

export interface ISendMessageAttributeList{ 
    MessageBody : string, 
    QueueUrl?    : string, 
    DelaySeconds?: number,              // not valid for FIFO
    MessageAttributes?:Object,
    MessageDeduplicationId? : string,   // valid for FIFO only
    MessageGroupId? : string            // valid for FIFO only
};



export interface ISendBatchMessageAttributeList extends ISendMessageAttributeList{
    Id : string   // unique identifier in batch
}

export interface IPullMessage extends IReceiveMessageAttributeList{}

export interface ISendMessage extends ISendMessageAttributeList{}

export interface ISendBatchMessage{ 
    Entries  : ISendBatchMessageAttributeList[],      // 10 is the limit.
    QueueUrl : string
};

export interface ISize{ 
    QueueUrl : string,
    AttributeNames?  : string[]
};

export interface IDeleteMessage{ 
    QueueUrl        : string,
    ReceiptHandle   : string
};

export interface IDeleteMultipleMessageObject{ 
    Id              : string,
    ReceiptHandle   : string
};

export interface IDeleteMultipleMessage{ 
    Entries  :  IDeleteMultipleMessageObject[],
    QueueUrl :  string
};

  


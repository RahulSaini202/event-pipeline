

export interface IRedrivePolicy{
    deadLetterTargetArn : string,
    maxReceiveCount     : string
}

export interface IAttributeList{
    DelaySeconds? : string,                     // 0 to 900 seconds,  default is 0.
    MaximumMessageSize?:string,                 // 1,024 bytes (1 KiB) to 262,144 bytes (256 KiB), default is 262,144.
    MessageRetentionPeriod?:string,             // 60 seconds (1 minute) to 1,209,600 seconds (14 days), default is 4days.
    ReceiveMessageWaitTimeSeconds?:string,      // 0 to 20 (seconds), default is 0.
    RedrivePolicy? : IRedrivePolicy,  
    FifoQueue?  : string,
    Policy?     : string,          
    VisibilityTimeout?   : string               //  0 to 43,200 (12 hours), default is 30sec
}

export interface ICreateQueue{
    QueueName    : string,
    Attributes?  : IAttributeList
} 


export interface IListQueue{
    QueueNamePrefix? : string
}

export interface IEmptyDeleteQueue{
    QueueUrl : string
}

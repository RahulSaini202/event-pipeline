export interface IListEmailDetails {
    cc?: string,
    bcc?: string,
    content: string,
    contentType: string,
    subject: string,
    sender: {
        name: string,
        // todo: this needs to be supported.
        replyTo?: string,
        email: string,
        attachment?: {

            mimetype: string,
            filename: string,
            data: string
        }[]
    }
}

export interface IListEmailContent extends IListEmailDetails {
    to: string,
}

export interface IListMultipleEmailContent extends IListEmailDetails {
    retryCount?: number
    to: string[],
    response?: {
        data: any, // xml string
        response: any
    }
}
export class RequestError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'RequestError';
    }
}
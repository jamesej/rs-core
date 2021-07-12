export interface IAuthUser {
    token: string;
    tokenExpiry: Date;
    email: string;
    originalEmail: string;
    roles: string;
    password: string;
    exp?: Date;
}

export function userIsAnon(user: IAuthUser) {
    return !user.email;
}
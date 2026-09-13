/** 可直接展示给管理台的业务错误，内部异常不返回数据库细节。 */
export class ApiError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 413 | 422 | 502 | 503,
    message: string,
    public code = 'invalid_request'
  ) {
    super(message);
  }
}

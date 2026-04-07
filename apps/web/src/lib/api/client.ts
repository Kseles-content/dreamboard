/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface LoginRequest {
  email?: string;
  name?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id?: number;
    email?: string;
  };
}

export interface RefreshResponse {
  accessToken?: string;
}

export interface LogoutResponse {
  message?: string;
}

export interface Board {
  id: string;
  title: string;
  description?: string | null;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

export interface CreateBoardRequest {
  title?: string;
  description?: string;
}

export interface UpdateBoardRequest {
  title?: string;
  description?: string;
}

export interface DeleteBoardResponse {
  deleted?: boolean;
  board?: Board;
}

export interface Card {
  id: string;
  boardId: string;
  type: "text";
  text: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

export interface CreateCardRequest {
  type?: "text";
  text?: string;
}

export interface CreateCardResponse {
  created?: Card;
}

export interface UpdateCardRequest {
  text?: string;
}

export interface DeleteCardResponse {
  deleted?: boolean;
  card?: Card;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "http://localhost:3000";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title DreamBoard API Contract
 * @version 1.2.0
 * @baseUrl http://localhost:3000
 *
 * Unified API contract for DreamBoard web and backend.
 * Endpoints marked with `x-implemented: false` are planned and documented to prevent client/backend drift.
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  v1 = {
    /**
     * No description
     *
     * @tags auth
     * @name AuthLoginCreate
     * @summary Login
     * @request POST:/v1/auth/login
     */
    authLoginCreate: (data: LoginRequest, params: RequestParams = {}) =>
      this.request<LoginResponse, any>({
        path: `/v1/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags auth
     * @name AuthRefreshCreate
     * @summary Refresh token
     * @request POST:/v1/auth/refresh
     */
    authRefreshCreate: (params: RequestParams = {}) =>
      this.request<RefreshResponse, any>({
        path: `/v1/auth/refresh`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags auth
     * @name AuthLogoutCreate
     * @summary Logout
     * @request POST:/v1/auth/logout
     */
    authLogoutCreate: (params: RequestParams = {}) =>
      this.request<LogoutResponse, any>({
        path: `/v1/auth/logout`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags boards
     * @name BoardsList
     * @summary List boards
     * @request GET:/v1/boards
     */
    boardsList: (
      query?: {
        /**
         * @min 1
         * @max 100
         */
        limit?: number;
        cursor?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<Board[], any>({
        path: `/v1/boards`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags boards
     * @name BoardsCreate
     * @summary Create board
     * @request POST:/v1/boards
     */
    boardsCreate: (data: CreateBoardRequest, params: RequestParams = {}) =>
      this.request<Board, any>({
        path: `/v1/boards`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags boards
     * @name BoardsDetail
     * @summary Get board
     * @request GET:/v1/boards/{boardId}
     */
    boardsDetail: (boardId: string, params: RequestParams = {}) =>
      this.request<Board, void>({
        path: `/v1/boards/${boardId}`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags boards
     * @name BoardsPartialUpdate
     * @summary Update board
     * @request PATCH:/v1/boards/{boardId}
     */
    boardsPartialUpdate: (
      boardId: string,
      data: UpdateBoardRequest,
      params: RequestParams = {},
    ) =>
      this.request<Board, any>({
        path: `/v1/boards/${boardId}`,
        method: "PATCH",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags boards
     * @name BoardsDelete
     * @summary Delete board
     * @request DELETE:/v1/boards/{boardId}
     */
    boardsDelete: (boardId: string, params: RequestParams = {}) =>
      this.request<DeleteBoardResponse, any>({
        path: `/v1/boards/${boardId}`,
        method: "DELETE",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags cards
     * @name BoardsCardsList
     * @summary List cards
     * @request GET:/v1/boards/{boardId}/cards
     */
    boardsCardsList: (boardId: string, params: RequestParams = {}) =>
      this.request<Card[], any>({
        path: `/v1/boards/${boardId}/cards`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags cards
     * @name BoardsCardsCreate
     * @summary Create card
     * @request POST:/v1/boards/{boardId}/cards
     */
    boardsCardsCreate: (
      boardId: string,
      data: CreateCardRequest,
      params: RequestParams = {},
    ) =>
      this.request<CreateCardResponse, any>({
        path: `/v1/boards/${boardId}/cards`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags cards
     * @name BoardsCardsPartialUpdate
     * @summary Update card
     * @request PATCH:/v1/boards/{boardId}/cards/{cardId}
     */
    boardsCardsPartialUpdate: (
      boardId: string,
      cardId: string,
      data: UpdateCardRequest,
      params: RequestParams = {},
    ) =>
      this.request<Card, any>({
        path: `/v1/boards/${boardId}/cards/${cardId}`,
        method: "PATCH",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags cards
     * @name BoardsCardsDelete
     * @summary Delete card
     * @request DELETE:/v1/boards/{boardId}/cards/{cardId}
     */
    boardsCardsDelete: (
      boardId: string,
      cardId: string,
      params: RequestParams = {},
    ) =>
      this.request<DeleteCardResponse, any>({
        path: `/v1/boards/${boardId}/cards/${cardId}`,
        method: "DELETE",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags cards
     * @name BoardsCardsReorderCreate
     * @summary Reorder cards (planned)
     * @request POST:/v1/boards/{boardId}/cards/reorder
     */
    boardsCardsReorderCreate: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/cards/reorder`,
        method: "POST",
        ...params,
      }),

    /**
     * No description
     *
     * @tags versions
     * @name BoardsVersionsList
     * @summary List versions (planned)
     * @request GET:/v1/boards/{boardId}/versions
     */
    boardsVersionsList: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/versions`,
        method: "GET",
        ...params,
      }),

    /**
     * No description
     *
     * @tags versions
     * @name BoardsVersionsCreate
     * @summary Create snapshot version (planned)
     * @request POST:/v1/boards/{boardId}/versions
     */
    boardsVersionsCreate: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/versions`,
        method: "POST",
        ...params,
      }),

    /**
     * No description
     *
     * @tags versions
     * @name BoardsVersionsRestoreCreate
     * @summary Restore version (planned)
     * @request POST:/v1/boards/{boardId}/versions/{versionId}/restore
     */
    boardsVersionsRestoreCreate: (
      boardId: string,
      versionId: string,
      params: RequestParams = {},
    ) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/versions/${versionId}/restore`,
        method: "POST",
        ...params,
      }),

    /**
     * No description
     *
     * @tags share-links
     * @name BoardsShareLinksList
     * @summary List share links (planned)
     * @request GET:/v1/boards/{boardId}/share-links
     */
    boardsShareLinksList: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/share-links`,
        method: "GET",
        ...params,
      }),

    /**
     * No description
     *
     * @tags share-links
     * @name BoardsShareLinksCreate
     * @summary Create share link (planned)
     * @request POST:/v1/boards/{boardId}/share-links
     */
    boardsShareLinksCreate: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/share-links`,
        method: "POST",
        ...params,
      }),

    /**
     * No description
     *
     * @tags share-links
     * @name BoardsShareLinksDelete
     * @summary Revoke share link (planned)
     * @request DELETE:/v1/boards/{boardId}/share-links/{linkId}
     */
    boardsShareLinksDelete: (
      boardId: string,
      linkId: string,
      params: RequestParams = {},
    ) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/share-links/${linkId}`,
        method: "DELETE",
        ...params,
      }),

    /**
     * No description
     *
     * @tags uploads
     * @name BoardsUploadsIntentsCreate
     * @summary Create upload intent (planned)
     * @request POST:/v1/boards/{boardId}/uploads/intents
     */
    boardsUploadsIntentsCreate: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/uploads/intents`,
        method: "POST",
        ...params,
      }),

    /**
     * No description
     *
     * @tags uploads
     * @name BoardsUploadsFinalizeCreate
     * @summary Finalize upload (planned)
     * @request POST:/v1/boards/{boardId}/uploads/finalize
     */
    boardsUploadsFinalizeCreate: (
      boardId: string,
      params: RequestParams = {},
    ) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/uploads/finalize`,
        method: "POST",
        ...params,
      }),

    /**
     * @description Client-side export in current build (no backend API endpoint).
     *
     * @tags export
     * @name BoardsExportPngList
     * @summary Export PNG
     * @request GET:/v1/boards/{boardId}/export/png
     */
    boardsExportPngList: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/export/png`,
        method: "GET",
        ...params,
      }),

    /**
     * @description Client-side export in current build (no backend API endpoint).
     *
     * @tags export
     * @name BoardsExportJpgList
     * @summary Export JPG
     * @request GET:/v1/boards/{boardId}/export/jpg
     */
    boardsExportJpgList: (boardId: string, params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/v1/boards/${boardId}/export/jpg`,
        method: "GET",
        ...params,
      }),
  };
}

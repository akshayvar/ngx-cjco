import { Inject, Injectable, Injector } from '@angular/core';
import { RestResource } from '../../models';
import { ResourcesConfiguration } from '../../decorators/resources-configuration.container';

import { RestRequestOptions } from './interfaces';
import { RestResourceEndpoint } from '../../resource-url/models/rest-resource-endpoint.model';
import { RestResourceVersion } from '../../resource-url/models/rest-resource-version.model';
import { RestIdentifierScheme } from '../../resource-url/enums/rest-identifier-scheme.enum';
import { RestResourceBaseService } from './rest-resource-base.service';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export abstract class RestResourceService<
  T extends RestResource<T, IdType>,
  IdType extends number | string = number | string
> extends RestResourceBaseService {

  private readonly versioningConfig: Map<string, string>;
  private readonly isVersioned: boolean;
  private readonly endpointConfig: RestResourceEndpoint;
  private resourceInstance: T;

  protected constructor(
    @Inject('Type') private type: new (object?: T) => T,
    private injector: Injector,
  ) {
    super(injector);
    const resource = ResourcesConfiguration.resources.find((r) => r.type.name == this.type.name)

    if (!resource) {
      throw new Error('Resource does not exist in configuration container\nEnsure you have decorated the class');
    }

    this.resourceInstance = new resource.type() as T;

    this.endpointConfig = this.resourceUrlService.getEndpoint(resource.resourceName);
    this.isVersioned = this.endpointConfig.versions !== undefined && this.endpointConfig.versions?.length > 0;
    this.versioningConfig = new Map<string, string>();

    if (this.isVersioned) {
      this.endpointConfig.versions?.forEach((v: RestResourceVersion) => {
        this.versioningConfig.set(v.verb, v.value)
      })
    }
  }

  public read(id?: IdType, options?: RestRequestOptions<T>): Observable<T | T[]> {
    const preparedUrl = this.prepareUrl(options);
    this.resourceInstance = new this.type() as T;

    if (this.resourceInstance === undefined) {
      return of();
    }

    // TODO: Take into account the different versioning schemes.
    return this.httpClient.get<T>(`${preparedUrl}/${id}`).pipe(
        map((data: T) => new this.type().fromJson(data))
    );
  }

  public list(options?: RestRequestOptions<T>): Observable<T | T[]> {
    const preparedUrl = this.prepareUrl(options);

    // TODO: Take into account the different versioning schemes.
    return this.httpClient.get<T>(preparedUrl).pipe(
      map((data: T) => new this.type().fromJson(data))
    );
  }

  public create(item: T, options?: RestRequestOptions<T>): Observable<T | T[]> {
    const preparedUrl = this.prepareUrl(options);

    return this.httpClient.post<T>(preparedUrl, item).pipe(
      map((data: T) => new this.type().fromJson(data))
    );
  }

  public update(item: T, options?: RestRequestOptions<T>): Observable<T | T[]> {
    const preparedUrl = `${this.prepareUrl(options)}/${item.id}`;
    console.table([preparedUrl, item]);
    return this.httpClient.put<T>(preparedUrl, item).pipe(
      map((data: T) => new this.type().fromJson(data))
    );
  }

  public delete(item: T, options?: RestRequestOptions<T>): Observable<T> {
    const preparedUrl = `${this.prepareUrl(options)}/${item.id}`;
    return this.httpClient.delete<T>(preparedUrl);
  }

  private prepareUrl(options?: RestRequestOptions<T>): string {
    let preparedUrl = this.endpointConfig.url.slice();

    if (options?.namedIdentifierParams
        && this.endpointConfig.identifierScheme === RestIdentifierScheme.Named) {
      preparedUrl = this.prepareUrlNamedIdentifiers(options.namedIdentifierParams);
    }
    else if(options?.identifierParams
            && this.endpointConfig.identifierScheme === RestIdentifierScheme.Array) {
      preparedUrl = this.prepareUrlIdentifiers(options.identifierParams);
    }

    if (options?.queryParams) {
      preparedUrl = `${preparedUrl}${this.prepareUrlParams(options?.queryParams)}`;
    }

    return preparedUrl;
  }

  private prepareUrlIdentifiers(identifiers: string[] | number[]): string {
    let url = '';
    const urlIdentifiers = [...identifiers];
    this.endpointConfig.url.split('/').forEach(((s: string) => {
      if (s.search(':id') !== -1) {
        const identifier = urlIdentifiers.shift();

        if (identifier === undefined) {
          throw new Error('Identifier mismatch');
        }

        url = url.concat(s.replace(':id', identifier.toString()), '/');
      } else {
        url = url.concat(`${s}/`);
      }
    }));

    return url.slice(0, -1);
  }

  private prepareUrlNamedIdentifiers(identifiers: { [param: string]: string | number }): string {
    const endpointUrl = this.endpointConfig.url.slice();
    for (const index in identifiers) {
      if (endpointUrl.search(index) === -1) {
        throw new Error (`Identifier ${index} not found in URL `);
      }

      const value = `${identifiers[index]}`;
      endpointUrl.replace(index, value);
    }

    return endpointUrl;
  }

  private prepareUrlParams(
    queryParams?: {
      [param: string]: string | string[] | number | number[];
    }): string {

    let endpointUrl = this.endpointConfig.url.slice();

    if (endpointUrl.endsWith('/')) {
      throw new Error("Remove trailing slash from endpoint URL in configuration file");
    }

    if (!queryParams) {
      return endpointUrl;
    }

    endpointUrl += '?';
    for (const urlParamsKey in queryParams) {
      if (Array.isArray(queryParams[urlParamsKey])
         && (queryParams[urlParamsKey] as Array<string>).length > 0) {
       const paramValue = (queryParams[urlParamsKey] as Array<string>)
        .reduce((prev: string | number, curr: string | number) => { return `${prev},${curr}`; });
       paramValue.trimEnd();
      }
      else {
        endpointUrl += `${urlParamsKey}=${queryParams[urlParamsKey]}&`;
      }
    }

    return endpointUrl;
  }
}

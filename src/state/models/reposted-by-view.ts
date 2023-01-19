import {makeAutoObservable, runInAction} from 'mobx'
import {AtUri} from '../../third-party/uri'
import {AppBskyFeedGetRepostedBy as GetRepostedBy} from '@atproto/api'
import {RootStoreModel} from './root-store'

const PAGE_SIZE = 30

export type RepostedByItem = GetRepostedBy.RepostedBy

export class RepostedByViewModel {
  // state
  isLoading = false
  isRefreshing = false
  hasLoaded = false
  error = ''
  resolvedUri = ''
  params: GetRepostedBy.QueryParams
  hasMore = true
  loadMoreCursor?: string
  private _loadMorePromise: Promise<void> | undefined

  // data
  uri: string = ''
  repostedBy: RepostedByItem[] = []

  constructor(
    public rootStore: RootStoreModel,
    params: GetRepostedBy.QueryParams,
  ) {
    makeAutoObservable(
      this,
      {
        rootStore: false,
        params: false,
      },
      {autoBind: true},
    )
    this.params = params
  }

  get hasContent() {
    return this.uri !== ''
  }

  get hasError() {
    return this.error !== ''
  }

  get isEmpty() {
    return this.hasLoaded && !this.hasContent
  }

  // public api
  // =

  async refresh() {
    return this.loadMore(true)
  }

  async loadMore(isRefreshing = false) {
    if (this._loadMorePromise) {
      return this._loadMorePromise
    }
    if (!this.resolvedUri) {
      await this._resolveUri()
    }
    this._loadMorePromise = this._loadMore(isRefreshing)
    await this._loadMorePromise
    this._loadMorePromise = undefined
  }

  // state transitions
  // =

  private _xLoading(isRefreshing = false) {
    this.isLoading = true
    this.isRefreshing = isRefreshing
    this.error = ''
  }

  private _xIdle(err?: any) {
    this.isLoading = false
    this.isRefreshing = false
    this.hasLoaded = true
    this.error = err ? err.toString() : ''
    if (err) {
      this.rootStore.log.error('Failed to fetch reposted by view', err)
    }
  }

  // loader functions
  // =

  private async _resolveUri() {
    const urip = new AtUri(this.params.uri)
    if (!urip.host.startsWith('did:')) {
      try {
        urip.host = await this.rootStore.resolveName(urip.host)
      } catch (e: any) {
        this.error = e.toString()
      }
    }
    runInAction(() => {
      this.resolvedUri = urip.toString()
    })
  }

  private async _loadMore(isRefreshing = false) {
    this._xLoading(isRefreshing)
    try {
      const params = Object.assign({}, this.params, {
        uri: this.resolvedUri,
        limit: PAGE_SIZE,
        before: this.loadMoreCursor,
      })
      if (this.isRefreshing) {
        this.repostedBy = []
      }
      const res = await this.rootStore.api.app.bsky.feed.getRepostedBy(params)
      await this._appendAll(res)
      this._xIdle()
    } catch (e: any) {
      this._xIdle(e)
    }
  }

  private _appendAll(res: GetRepostedBy.Response) {
    this.loadMoreCursor = res.data.cursor
    this.hasMore = !!this.loadMoreCursor
    this.repostedBy = this.repostedBy.concat(res.data.repostedBy)
  }
}

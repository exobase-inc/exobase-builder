import _ from 'radash'

interface PropertyActivity {
  called: number,
  args: any[],
  calledWith: any,
  accessed: number
}

type Activity = {
  [key: string]: PropertyActivity
}

export const createStub = <T>(properties: Record<string, any>) => {

  let activity: Activity = Object.keys(properties).reduce((acc, propertyName) => ({
    ...acc, [propertyName]: {
      accessed: 0,
      called: 0,
      args: [],
      calledWith: undefined
    }
  }), {} as Activity)

  const handleCall = (propertyName: string) => {
    const providedProperty = properties[propertyName]
    if (!providedProperty) {
      return undefined
    }
    const isFunc = _.isFunction(providedProperty)
    if (isFunc) {
      return (...args: any[]) => {
        const current = activity[propertyName]
        activity = {
          ...activity, [propertyName]: {
            ...current,
            called: current.called + 1,
            args: [...current.args, args],
            calledWith: args
          }
        }
        return providedProperty(...args)
      }
    }
    const current = activity[propertyName]
    activity = {
      ...activity, [propertyName]: {
        ...current,
        accessed: current.accessed + 1
      }
    }
    return providedProperty
  }

  const proxy = _.proxied(handleCall)

  return {
    stub: proxy as any as T,
    activity: () => activity
  }

}
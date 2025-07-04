import Graphemer from 'graphemer'

let splitter: Graphemer | undefined

function isASCII(value: string): boolean {
  return /^[\u0020-\u007F]*$/u.test(value)
}

export function getStringLength(value: string): number {
  if (isASCII(value)) {
    return value.length
  }

  splitter ??= new Graphemer()

  return splitter.countGraphemes(value)
}

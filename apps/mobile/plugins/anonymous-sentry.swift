// HeyDPE native crash privacy. Runs before React Native/JavaScript startup.
private func startAnonymousSentry() {
  guard let dsn = Bundle.main.object(forInfoDictionaryKey: "HeyDPESentryDSN") as? String, !dsn.isEmpty else { return }
  SentrySDK.start { options in
    options.dsn = dsn
    options.sendDefaultPii = false
    options.enableAutoSessionTracking = false
    options.enableAutoPerformanceTracing = false
    options.enableAppHangTracking = false
    options.enableNetworkBreadcrumbs = false
    options.attachScreenshot = false
    options.attachViewHierarchy = false
    options.maxBreadcrumbs = 0
    options.beforeBreadcrumb = { _ in nil }
    options.beforeSend = { event in
      let clean = Event(level: event.level)
      clean.eventId = event.eventId
      clean.timestamp = event.timestamp
      clean.platform = event.platform
      clean.releaseName = event.releaseName
      clean.dist = event.dist
      clean.environment = event.environment
      // Preserve binary identifiers/addresses needed for native symbolication.
      clean.debugMeta = event.debugMeta?.map { image in
        image.name = image.name.map { URL(fileURLWithPath: $0).lastPathComponent }
        image.codeFile = image.codeFile.map { URL(fileURLWithPath: $0).lastPathComponent }
        return image
      }
      clean.exceptions = event.exceptions?.map { exception in
        let types = ["EXC_BAD_ACCESS", "EXC_CRASH", "SIGABRT", "SIGSEGV", "SIGBUS", "NSInvalidArgumentException", "NSRangeException"]
        let kind = types.contains(exception.type) ? exception.type : "NativeException"
        let safe = Exception(value: "Native crash: " + kind, type: kind)
        safe.threadId = exception.threadId
        safe.stacktrace = anonymousStack(exception.stacktrace)
        return safe
      }
      clean.threads = event.threads?.map { thread in
        let safe = SentryThread(threadId: thread.threadId)
        safe.crashed = thread.crashed
        safe.current = thread.current
        safe.isMain = thread.isMain
        safe.stacktrace = anonymousStack(thread.stacktrace)
        return safe
      }
      clean.stacktrace = anonymousStack(event.stacktrace)
      return clean
    }
  }
}

private func anonymousStack(_ stack: SentryStacktrace?) -> SentryStacktrace? {
  guard let stack = stack else { return nil }
  let frames = stack.frames.map { frame in
    let safe = Frame()
    safe.instructionAddress = frame.instructionAddress
    safe.symbolAddress = frame.symbolAddress
    safe.imageAddress = frame.imageAddress
    safe.inApp = frame.inApp
    // Native symbolication uses uploaded dSYMs; omit paths, source and local vars.
    return safe
  }
  return SentryStacktrace(frames: frames, registers: [:])
}

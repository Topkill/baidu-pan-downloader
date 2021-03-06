/* eslint-disable @typescript-eslint/no-use-before-define,@typescript-eslint/camelcase */
import { InstanceForSystem } from './InstaceForSystem'
import { IItem, StatusTypes, ValueTypes } from './types'
import { GM } from './gmInterface/gmInterface'
import { addNextDownloadRequest, downloadItem, getDownloadUrl } from './apis'
import { formatByte } from './utils'
import { initStyle } from './style'

window.onunload = () => {
  GM.setValue(ValueTypes.items, InstanceForSystem.allDownloads)

  InstanceForSystem.stopAll()
}
window.onbeforeunload = (e: BeforeUnloadEvent) => {
  if (Object.keys(InstanceForSystem.downloadingItems).length > 0) {
    e.preventDefault()
    e.returnValue = '有未完成的下载任务， 确认关闭吗?'
  }
}
;(function() {
  initStyle()
  renderElement()
  const { autoStart, downloadable } = InstanceForSystem
  Object.values(InstanceForSystem.initState().allDownloads).forEach((arr) => {
    appendRow(arr)
    if (arr.status === StatusTypes.downloading && autoStart && downloadable) {
      downloadItem(arr)
    }
  })

  // update operation dom
  GM.addValueChangeListener(ValueTypes.items, (name, oldItems, newItems: typeof InstanceForSystem.allDownloads) => {
    Object.values(newItems).forEach((item) => {
      renderOperationElement(item)
    })
  })

  document.getElementById('floating-button')!.addEventListener('click', () => {
    const modalWrapper = document.getElementById('download-list') as HTMLDivElement
    modalWrapper.className = modalWrapper.className + ' open'
    startInstance()
  })
  document.getElementById('config-button')!.addEventListener('click', () => {
    const modalWrapper = document.getElementById('config-modal') as HTMLDivElement
    modalWrapper.className = modalWrapper.className + ' open'
  })

  document.getElementById('max-download-count')!.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement
    GM.setValue(ValueTypes.maxDownloadCount, parseInt(target!.value))
  })
  document.getElementById('auto-start')!.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement
    GM.setValue(ValueTypes.autoStart, target.checked)
  })

  document.querySelectorAll('.modal-overlay,.modal-close').forEach((e) =>
    e.addEventListener('click', () => {
      document.querySelectorAll('.modal-wrapper').forEach((element) => {
        element.className = 'modal-wrapper'
      })
    })
  )
})()

function appendRow(arr: IItem) {
  document.getElementById('popup-tbody')!.insertAdjacentHTML(
    'beforeend',
    `
        <tr id="row-${arr.fs_id}">
          <td data-label="filename">${arr.server_filename}</td>
          <td data-label="download">
            <div class="wrap">
              <div class="progress-radial progress-${arr.status === StatusTypes.completed ? '100' : '0'}">
                <div data-label="${arr.fs_id}"
                    class="overlay">${arr.status === StatusTypes.completed ? '100' : '0'}%</div>
              </div>
            </div>
          </td>
          <td data-label="url">${formatByte(arr.size)}</td>
          <td data-label="speed"></td>
          <td data-label="operation"></td>
        </tr>
  `
  )
  renderOperationElement(arr)
}

export function renderOperationElement(arr: IItem) {
  const target = document.getElementById(`row-${arr.fs_id}`)!.querySelector('td[data-label="operation"]')
  if (target) {
    target.innerHTML = ''
    target.insertAdjacentHTML(
      'beforeend',
      `
            <svg
                id="start-item-${arr.fs_id}"
                class="${[StatusTypes.downloading, StatusTypes.inQueued].includes(arr.status) ? 'disabled' : ''}"
                xmlns="http://www.w3.org/2000/svg"
                height="24"
                viewBox="0 0 24 24"
                width="24">
                <path d="M0 0h24v24H0z" fill="none"/>
                <path d="M8 5v14l11-7z"/>
            </svg>
            <svg
                id="stop-item-${arr.fs_id}"
                class="${[StatusTypes.downloading, StatusTypes.inQueued].includes(arr.status) ? '' : 'disabled'}"
                xmlns="http://www.w3.org/2000/svg"
                height="24"
                viewBox="0 0 24 24"
                width="24">
                    <path d="M0 0h24v24H0z" fill="none"/>
                    <path d="M6 6h12v12H6z"/>
            </svg>
            <svg
                id="delete-item-${arr.fs_id}"
                class="delete-item"
                style="position: absolute; right: 5px"
                xmlns="http://www.w3.org/2000/svg"
                height="24" viewBox="0 0 24 24" width="24">
                    <path d="M0 0h24v24H0z" fill="none"/>
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
    `
    )

    const { allDownloads, downloadingItems, completedItems, stoppedItems } = InstanceForSystem

    document.getElementById(`start-item-${arr.fs_id}`)!.addEventListener('click', () => {
      downloadItem(arr)
    })
    document.getElementById(`stop-item-${arr.fs_id}`)!.addEventListener('click', () => {
      const targetItem = InstanceForSystem.allDownloads[arr.fs_id]
      if (targetItem) {
        if (arr.status === StatusTypes.downloading) {
          if (!confirm('停止后将需要重新下载， 确认吗？')) {
            return false
          }
        }
        arr.status = StatusTypes.stopped
        targetItem.request && targetItem.request.abort && targetItem.request.abort()
        clearInterval(targetItem.progress_loader_id!)
        stoppedItems[arr.fs_id] = arr
        delete downloadingItems[arr.fs_id]

        renderOperationElement(arr)
        addNextDownloadRequest()
        return false
      }
    })
    document.getElementById(`delete-item-${arr.fs_id}`)!.addEventListener('click', () => {
      arr.request && arr.request.abort && arr.request.abort()
      delete allDownloads[arr.fs_id]
      delete downloadingItems[arr.fs_id]
      delete completedItems[arr.fs_id]
      delete stoppedItems[arr.fs_id]

      document
        .getElementById('popup-tbody')!
        .removeChild(document.getElementById(`row-${arr.fs_id}`) as HTMLTableRowElement)
      addNextDownloadRequest()
    })
  }
}

function renderElement() {
  const loopOption = (maxCount: number) => {
    const currentValue = GM.getValue(ValueTypes.maxDownloadCount, InstanceForSystem.maxDownloadCount)
    let text = ''
    for (let i = 1; i <= maxCount; i++) {
      text += `<option ${currentValue === i && 'selected'} value="${i}">${i}</option>`
    }
    return text
  }
  document.body.insertAdjacentHTML(
    'beforeend',
    `
        <div id="download-list" class="modal-wrapper">
            <div class="modal-overlay"></div>
            <div class="modal-window">
                <div class="modal-content">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">文件</th>
                        <th scope="col">进度</th>
                        <th scope="col">大小</th>
                        <th scope="col">速度</th>
                        <th scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody id="popup-tbody"></tbody>
                  </table>
                </div>
<!--                <span class="modal-close">×</a>-->
            </div>
        </div>
        <div id="config-modal" class="modal-wrapper">
            <div class="modal-overlay"></div>
            <div class="modal-window" style="max-width: 500px">
                <div class="modal-content">
                  <form action="#">
                    <header>
                      <h2>下载设置</h2>
                      <div>如果下载经常出错，建议将下载数设置为1</div>
                    </header>
                    <div>
                      <fieldset>
                        <legend class="desc">
                          自动下载
                        </legend>
                        <div>
                        <div>
                          <input type="checkbox" name="checkbox"
                             value="true"
                             ${InstanceForSystem.autoStart && 'checked'}
                             id="auto-start"
                             tabindex="1"
                           >
                          <label for="auto-start"></label>
                        </div>
                      </fieldset>
                    </div>

                    <div>
                      <label class="desc" id="title106" for="Field106">
                        最大同时下载数
                      </label>
                      <div>
                      <select id="max-download-count" class="field select medium" tabindex="2">
                        ${loopOption(InstanceForSystem.maxDownloadCount)}
                      </select>
                      </div>
                    </div>
                  </form>
                </div>
<!--                <span class="modal-close">×</a>-->
            </div>
        </div>
        <div id="container-floating">
          <div id="config-button" class="nd1 nds" data-toggle="tooltip" data-placement="left">
              <img class="reminder" src="https://ssl.gstatic.com/bt/C3341AA7A1A076756462EE2E5CD71C11/1x/bt_compose2_1x.png">
          </div>
          <div id="floating-button" data-toggle="tooltip" data-placement="left" data-original-title="Create">
            <p class="plus">+</p>
            <img class="edit" src="//ssl.gstatic.com/bt/C3341AA7A1A076756462EE2E5CD71C11/1x/ic_reminders_speeddial_white_24dp.png">
          </div>
        </div>
    `
  )
}
function startInstance() {
  const { selectedList, allDownloads, autoStart } = InstanceForSystem

  const requestList: Promise<IItem>[] = []
  selectedList.forEach((arr) => {
    if (typeof allDownloads[arr.fs_id] === 'undefined') {
      arr.status = StatusTypes.inQueued
      allDownloads[arr.fs_id] = arr

      appendRow(arr)
      requestList.push(getDownloadUrl(arr))
    }
  })
  Promise.all(requestList).then((arrs) => {
    arrs.forEach((arr) => {
      if (autoStart) {
        downloadItem(arr)
      }
    })
  })
}

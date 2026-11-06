const { layout, escapeHtml, iconSvg, renderToast } = require('./layout');

function folderUrl(folderId) {
  if (!folderId) return '/admin';
  return `/admin?folder=${encodeURIComponent(folderId)}`;
}

function uploadReturnUrl(selectedFolder) {
  if (!selectedFolder) return '/admin';
  return `/admin?folder=${encodeURIComponent(selectedFolder)}`;
}

function renderFolderOptions(folders, selectedValue = '') {
  return `<option value="" ${selectedValue === '' ? 'selected' : ''}>未分组</option>` + folders.map((folder) => `
    <option value="${escapeHtml(folder.id)}" ${selectedValue === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>
  `).join('');
}

function renderAlert(query) {
  if (query.error) return renderToast(query.error, 'error');
  return '';
}

function uploadPage({ folders, selectedFolder, query, currentUser, csrfToken, settings, dataSize, diskStats }) {
  const uploadFolderDefault = selectedFolder && selectedFolder !== 'ungrouped' ? selectedFolder : '';
  const returnFolder = selectedFolder || '';

  return layout({
    title: '上传文件',
    currentUser,
    csrfToken,
    activeNav: 'sites',
    settings,
    dataSize,
    diskStats,
    content: `
      <div class="page-head">
        <div>
          <div class="page-title">上传文件</div>
          <div class="page-desc">上传 HTML、ZIP、MHTML、图片、SVG、PDF，或直接上传文件夹，并指定站点主文件。</div>
        </div>
        <div class="head-actions">
          <a class="btn" href="${escapeHtml(uploadReturnUrl(selectedFolder))}">返回网站管理</a>
        </div>
      </div>

      ${renderAlert(query)}

      <div class="upload-page">
        <form class="upload-card" id="uploadForm" method="post" action="/admin/upload" enctype="multipart/form-data">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input type="hidden" name="returnFolder" value="${escapeHtml(returnFolder)}">
          <input type="hidden" name="returnView" value="sites">
          <input type="hidden" name="folderName" id="folderNameInput" value="">

          <div class="upload-mode">
            <button type="button" id="modeFile" class="is-active">单文件</button>
            <button type="button" id="modeFolder">文件夹</button>
          </div>

          <div class="drop-zone" id="dropZone">
            <input class="drop-input" id="siteFileInput" type="file" name="siteFile" accept=".html,.htm,.zip,.mhtml,.mht,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.ico,.bmp" required>
            <input class="drop-input" id="siteFolderInput" type="file" name="siteFiles" webkitdirectory directory multiple disabled>
            <span class="drop-icon">${iconSvg('upload', 20)}</span>
            <span class="drop-title" id="dropTitle">拖拽文件到这里，或点击选择文件</span>
            <span class="drop-desc" id="dropDesc">支持 HTML、ZIP、MHTML、PNG、JPG、GIF、WEBP、SVG、PDF，最大 50MB。</span>
            <span class="upload-file-name" id="selectedFileName">尚未选择文件</span>
          </div>

          <div class="upload-form-grid entry-field" id="entryField" hidden>
            <label>
              <span>主文件</span>
              <select id="entrySelect" name="entryFile"></select>
              <span class="entry-hint" id="entryHint"></span>
            </label>
          </div>

          <div class="upload-form-grid">
            <label>
              <span>上传到文件夹</span>
              <select name="folderId">${renderFolderOptions(folders, uploadFolderDefault)}</select>
            </label>
            <label>
              <span>访问天数（0 = 永久）</span>
              <input type="number" name="accessDays" value="365" min="0" max="36500" placeholder="365">
            </label>
          </div>
          <div class="upload-form-grid" style="grid-template-columns:1fr;">
            <label>
              <span>当前返回位置</span>
              <a class="link-box" href="${escapeHtml(folderUrl(selectedFolder))}">${escapeHtml(selectedFolder ? '当前分组列表' : '全部站点列表')}</a>
            </label>
          </div>

          <div class="upload-actions">
            <a class="btn" href="${escapeHtml(uploadReturnUrl(selectedFolder))}">取消</a>
            <button type="submit" id="uploadSubmit">开始上传</button>
          </div>
        </form>
      </div>

      <script>
        (function () {
          var form = document.getElementById('uploadForm');
          var dropZone = document.getElementById('dropZone');
          var fileInput = document.getElementById('siteFileInput');
          var folderInput = document.getElementById('siteFolderInput');
          var selectedFileName = document.getElementById('selectedFileName');
          var dropTitle = document.getElementById('dropTitle');
          var dropDesc = document.getElementById('dropDesc');
          var entryField = document.getElementById('entryField');
          var entrySelect = document.getElementById('entrySelect');
          var entryHint = document.getElementById('entryHint');
          var folderNameInput = document.getElementById('folderNameInput');
          var modeFile = document.getElementById('modeFile');
          var modeFolder = document.getElementById('modeFolder');
          var mode = 'file';
          var folderItems = [];

          function isHtml(name) {
            return /\\.html?$/i.test(name || '');
          }

          function stripRoot(relativePath) {
            var parts = String(relativePath || '').replace(/\\\\/g, '/').split('/').filter(Boolean);
            if (parts.length > 1) parts.shift();
            return parts.join('/');
          }

          function defaultEntry(paths) {
            var index = paths.findIndex(function (item) { return item.toLowerCase() === 'index.html'; });
            if (index >= 0) return paths[index];
            index = paths.findIndex(function (item) { return item.toLowerCase() === 'index.htm'; });
            return index >= 0 ? paths[index] : '';
          }

          function setHint(text) {
            entryHint.textContent = text || '';
          }

          function showEntry(paths, kind) {
            entryField.hidden = false;
            entrySelect.innerHTML = '';
            entrySelect.disabled = false;
            entrySelect.required = false;
            if (kind === 'asset') {
              entrySelect.disabled = true;
              entrySelect.innerHTML = '<option value="">直接预览</option>';
              setHint('图片、SVG 和 PDF 上传后可在文件管理中预览。');
              return;
            }
            if (kind === 'mhtml') {
              entrySelect.disabled = true;
              entrySelect.innerHTML = '<option value="">自动识别</option>';
              setHint('MHTML 会解包成静态站点，主文件自动取其中的 HTML 页面。');
              return;
            }
            if (kind === 'html') {
              entrySelect.disabled = true;
              entrySelect.innerHTML = '<option value="index.html"></option>';
              entrySelect.options[0].textContent = paths[0] || 'index.html';
              setHint('单个 HTML 会作为站点首页。');
              return;
            }
            var placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = paths.length ? '请选择主文件' : '没有 HTML 文件';
            entrySelect.appendChild(placeholder);
            paths.forEach(function (item) {
              var option = document.createElement('option');
              option.value = item;
              option.textContent = item;
              entrySelect.appendChild(option);
            });
            var preferred = defaultEntry(paths);
            entrySelect.value = preferred;
            entrySelect.required = true;
            if (!paths.length) setHint('没有找到 HTML 文件，无法作为站点上传。');
            else if (preferred) setHint('已默认选择根目录 index，也可以改成其他 HTML。主文件可以在子目录中。');
            else setHint('没有根目录 index.html，请手动指定主文件。主文件可以在子目录中。');
          }

          function resetSelection() {
            folderItems = [];
            folderNameInput.value = '';
            fileInput.value = '';
            folderInput.value = '';
            entryField.hidden = true;
            entrySelect.innerHTML = '';
            entrySelect.disabled = true;
            entrySelect.required = false;
            selectedFileName.textContent = mode === 'folder' ? '尚未选择文件夹' : '尚未选择文件';
            selectedFileName.classList.remove('has-file');
          }

          function setMode(next) {
            mode = next;
            modeFile.classList.toggle('is-active', mode === 'file');
            modeFolder.classList.toggle('is-active', mode === 'folder');
            fileInput.disabled = mode !== 'file';
            folderInput.disabled = mode !== 'folder';
            fileInput.required = mode === 'file';
            dropTitle.textContent = mode === 'folder' ? '拖拽文件夹到这里，或点击选择文件夹' : '拖拽文件到这里，或点击选择文件';
            dropDesc.textContent = mode === 'folder'
              ? '上传整个文件夹。总大小不超过 50MB，选完后指定 HTML 主文件。'
              : '支持 HTML、ZIP、MHTML、PNG、JPG、GIF、WEBP、SVG、PDF，最大 50MB。';
            resetSelection();
          }

          function extensionOf(name) {
            var match = String(name || '').toLowerCase().match(/\\.[a-z0-9]+$/);
            return match ? match[0] : '';
          }

          function useSingleFile(file) {
            var ext = extensionOf(file.name);
            if (['.html', '.htm', '.zip', '.mhtml', '.mht', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.ico', '.bmp'].indexOf(ext) < 0) {
              resetSelection();
              selectedFileName.textContent = '只支持 HTML、ZIP、MHTML、图片、SVG 或 PDF';
              return;
            }
            folderItems = [];
            folderNameInput.value = '';
            selectedFileName.textContent = file.name;
            selectedFileName.classList.add('has-file');
            if (ext === '.html' || ext === '.htm') showEntry([file.name], 'html');
            else if (ext === '.mhtml' || ext === '.mht') showEntry([], 'mhtml');
            else if (ext === '.zip') listZipHtml(file).then(function (paths) {
              showEntry(paths, 'zip');
            }).catch(function () {
              showEntry([], 'zip');
              setHint('无法读取 ZIP 文件列表，请确认压缩包未损坏。');
            });
            else showEntry([file.name], 'asset');
          }

          function useFolder(items, folderName) {
            folderItems = items;
            folderNameInput.value = folderName || '文件夹';
            var htmlFiles = items.map(function (item) { return item.relativePath; }).filter(isHtml);
            selectedFileName.textContent = (folderName || '文件夹') + '（' + items.length + ' 个文件）';
            selectedFileName.classList.add('has-file');
            showEntry(htmlFiles, 'folder');
          }

          function listZipHtml(file) {
            return file.slice(Math.max(0, file.size - (65557)), file.size).arrayBuffer().then(function (tailBuffer) {
              var tail = new Uint8Array(tailBuffer);
              var eocd = -1;
              for (var i = tail.length - 22; i >= 0; i -= 1) {
                if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
                  eocd = i;
                  break;
                }
              }
              if (eocd < 0) throw new Error('bad zip');
              var view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
              var cdSize = view.getUint32(eocd + 12, true);
              var cdOffset = view.getUint32(eocd + 16, true);
              if (cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error('zip64');
              return file.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
            }).then(function (cdBuffer) {
              var cd = new Uint8Array(cdBuffer);
              var dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
              var names = [];
              var offset = 0;
              while (offset + 46 <= cd.length && dv.getUint32(offset, true) === 0x02014b50) {
                var flags = dv.getUint16(offset + 8, true);
                var nameLen = dv.getUint16(offset + 28, true);
                var extraLen = dv.getUint16(offset + 30, true);
                var commentLen = dv.getUint16(offset + 32, true);
                var nameBytes = cd.slice(offset + 46, offset + 46 + nameLen);
                var name = decodeZipName(nameBytes, flags).replace(/\\\\/g, '/');
                if (name && name.charAt(name.length - 1) !== '/' && isHtml(name)) names.push(name.replace(/^\\/+/, ''));
                offset += 46 + nameLen + extraLen + commentLen;
              }
              return names;
            });
          }

          function decodeZipName(bytes, flags) {
            if (flags & 0x800) return new TextDecoder('utf-8').decode(bytes);
            try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch (error) {
              try { return new TextDecoder('gbk').decode(bytes); }
              catch (ignored) { return new TextDecoder('latin1').decode(bytes); }
            }
          }

          function readEntries(reader) {
            return new Promise(function (resolve, reject) {
              var all = [];
              function next() {
                reader.readEntries(function (batch) {
                  if (!batch.length) { resolve(all); return; }
                  all = all.concat(Array.prototype.slice.call(batch));
                  next();
                }, reject);
              }
              next();
            });
          }

          function collectEntry(entry) {
            if (entry.isFile) {
              return new Promise(function (resolve, reject) {
                entry.file(function (file) {
                  resolve([{ file: file, relativePath: stripRoot(String(entry.fullPath || file.name).replace(/^\\/+/, '')) }]);
                }, reject);
              });
            }
            return readEntries(entry.createReader()).then(function (entries) {
              return Promise.all(entries.map(collectEntry)).then(function (groups) {
                return groups.reduce(function (all, group) { return all.concat(group); }, []);
              });
            });
          }

          dropZone.addEventListener('click', function () {
            (mode === 'folder' ? folderInput : fileInput).click();
          });

          modeFile.addEventListener('click', function () { setMode('file'); });
          modeFolder.addEventListener('click', function () { setMode('folder'); });

          ['dragenter', 'dragover'].forEach(function (eventName) {
            dropZone.addEventListener(eventName, function (event) {
              event.preventDefault();
              event.stopPropagation();
              dropZone.classList.add('is-dragover');
            });
          });

          ['dragleave', 'drop'].forEach(function (eventName) {
            dropZone.addEventListener(eventName, function (event) {
              event.preventDefault();
              event.stopPropagation();
              dropZone.classList.remove('is-dragover');
            });
          });

          dropZone.addEventListener('drop', function (event) {
            var transfer = event.dataTransfer;
            if (!transfer) return;
            var entries = [];
            if (transfer.items) {
              Array.prototype.forEach.call(transfer.items, function (item) {
                var entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
                if (entry) entries.push(entry);
              });
            }
            if (entries.some(function (entry) { return entry.isDirectory; })) {
              setMode('folder');
              var directory = entries.filter(function (entry) { return entry.isDirectory; })[0];
              collectEntry(directory).then(function (items) {
                useFolder(items, directory.name);
              }).catch(function () {
                selectedFileName.textContent = '读取文件夹失败';
              });
              return;
            }
            if (transfer.files && transfer.files.length) {
              setMode('file');
              var carrier = new DataTransfer();
              carrier.items.add(transfer.files[0]);
              fileInput.files = carrier.files;
              useSingleFile(transfer.files[0]);
            }
          });

          fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files[0]) useSingleFile(fileInput.files[0]);
            else resetSelection();
          });

          folderInput.addEventListener('change', function () {
            var files = Array.prototype.slice.call(folderInput.files || []);
            if (!files.length) { resetSelection(); return; }
            var first = files[0].webkitRelativePath || files[0].name;
            var folderName = String(first).split('/')[0] || '文件夹';
            useFolder(files.map(function (file) {
              return { file: file, relativePath: stripRoot(file.webkitRelativePath || file.name) };
            }), folderName);
          });

          form.addEventListener('submit', function (event) {
            if (mode !== 'folder') return;
            event.preventDefault();
            if (!folderItems.length || (entrySelect.required && !entrySelect.value)) return;
            var data = new FormData();
            Array.prototype.forEach.call(form.elements, function (element) {
              if (!element.name || element.disabled || element.type === 'file' || element.type === 'submit') return;
              data.append(element.name, element.value);
            });
            data.set('folderName', folderNameInput.value || '文件夹');
            data.set('entryFile', entrySelect.value || '');
            data.set('sitePaths', JSON.stringify(folderItems.map(function (item) { return item.relativePath; })));
            folderItems.forEach(function (item) {
              data.append('siteFiles', item.file, item.relativePath);
            });
            var submitButton = document.getElementById('uploadSubmit');
            submitButton.disabled = true;
            fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' })
              .then(function (response) { window.location = response.url || '/admin'; })
              .catch(function () {
                submitButton.disabled = false;
                selectedFileName.textContent = '上传失败，请重试';
              });
          });
        })();
      </script>
    `
  });
}

module.exports = { uploadPage };

//go:build windows

package filesystem

import (
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/sys/windows"
)

// longThreshold is where the classic MAX_PATH limit starts to bite.
const longThreshold = 240

// longPath adds the extended-length prefix to long absolute paths (D039).
func longPath(path string) string {
	if len(path) < longThreshold || strings.HasPrefix(path, `\\?\`) || !filepath.IsAbs(path) {
		return path
	}
	clean := filepath.Clean(path)
	if strings.HasPrefix(clean, `\\`) {
		return `\\?\UNC\` + clean[2:]
	}
	return `\\?\` + clean
}

// fileID is volume serial + file index: the identity of hardlinked files.
func fileID(path string) string {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return ""
	}
	h, err := windows.CreateFile(p, 0, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(h)
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &info); err != nil {
		return ""
	}
	index := uint64(info.FileIndexHigh)<<32 | uint64(info.FileIndexLow)
	return strconv.FormatUint(uint64(info.VolumeSerialNumber), 16) + ":" + strconv.FormatUint(index, 16)
}

func volumeOf(path string) (string, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", err
	}
	buf := make([]uint16, windows.MAX_PATH+1)
	if err := windows.GetVolumePathName(p, &buf[0], uint32(len(buf))); err != nil {
		return "", err
	}
	return windows.UTF16ToString(buf), nil
}

func freeSpace(path string) (int64, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	var free, total, totalFree uint64
	if err := windows.GetDiskFreeSpaceEx(p, &free, &total, &totalFree); err != nil {
		return 0, err
	}
	return int64(free), nil
}

// fixedDrives lists the local fixed disks ("C:\"); removable, network and
// optical drives are not searched.
func fixedDrives() ([]string, error) {
	mask, err := windows.GetLogicalDrives()
	if err != nil {
		return nil, err
	}
	var out []string
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) == 0 {
			continue
		}
		root := string(rune('A'+i)) + ":\\"
		p, _ := windows.UTF16PtrFromString(root)
		if windows.GetDriveType(p) == windows.DRIVE_FIXED {
			out = append(out, root)
		}
	}
	return out, nil
}

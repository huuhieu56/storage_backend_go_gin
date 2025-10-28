package utils

import (
	"math"
	"os/exec"
	"strconv"
	"strings"
)

// GetVideoDurationInSeconds returns the duration of the given video file by invoking ffprobe.
// It rounds the duration to the nearest whole second.
func GetVideoDurationInSeconds(ffprobePath, path string) (int, error) {
	cmd := exec.Command(ffprobePath, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path)
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	durationStr := strings.TrimSpace(string(output))
	if durationStr == "" {
		return 0, nil
	}

	duration, err := strconv.ParseFloat(durationStr, 64)
	if err != nil {
		return 0, err
	}

	if duration < 0 {
		duration = 0
	}

	return int(math.Round(duration)), nil
}

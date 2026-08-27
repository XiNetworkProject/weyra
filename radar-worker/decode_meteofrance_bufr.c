/*
 * Decode the Météo-France mainland reflectivity mosaic from BUFR into a
 * compact float32 grid. This program links against EUMETNET OPERA BUFR 3.2.
 * The OPERA library remains covered by LGPL-2.1.
 */

#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "bufrlib.h"
#include "bufr_io.h"

#define OUTPUT_BUFFER_SIZE 8192
#define OUTPUT_NODATA -9999.0f

typedef struct {
    FILE *grid;
    FILE *probability_grid;
    float output_buffer[OUTPUT_BUFFER_SIZE];
    float probability_buffer[OUTPUT_BUFFER_SIZE];
    size_t output_buffer_count;
    size_t probability_buffer_count;
    size_t pixel_count;
    size_t probability_pixel_count;
    size_t missing_count;
    size_t probability_missing_count;
    size_t undetect_count;
    size_t visible_count;
    size_t strong_count;
    size_t expected_pixels;
    int rows;
    int columns;
    double pixel_size_x;
    double pixel_size_y;
    double top_left_latitude;
    double top_left_longitude;
    double longitude_origin;
    double projection_center;
    double reference_latitude;
    double geodetic_system;
    double scan_mode;
    int projection_type;
    int coordinate_grid_type;
    int have_top_left_latitude;
    int have_top_left_longitude;
    int replication_armed;
    int capturing_probability;
    int capturing_reflectivity;
    double minimum_probability;
    double maximum_probability;
    double minimum_dbzh;
    double maximum_dbzh;
} decoder_state_t;

static decoder_state_t state;

static int descriptor_is(int index, int f, int x, int y) {
    dd *descriptor;

    if (index < 0 || des[index] == NULL || des[index]->id != ELDESC) return 0;
    descriptor = &(des[index]->el->d);
    return descriptor->f == f && descriptor->x == x && descriptor->y == y;
}

static int flush_output_buffer(void) {
    size_t written;

    if (state.output_buffer_count == 0) return 1;
    written = fwrite(
        state.output_buffer,
        sizeof(float),
        state.output_buffer_count,
        state.grid
    );
    if (written != state.output_buffer_count) return 0;
    state.output_buffer_count = 0;
    return 1;
}

static int append_pixel(float value) {
    state.output_buffer[state.output_buffer_count++] = value;
    if (state.output_buffer_count == OUTPUT_BUFFER_SIZE) return flush_output_buffer();
    return 1;
}

static int flush_probability_buffer(void) {
    size_t written;

    if (state.probability_buffer_count == 0) return 1;
    written = fwrite(
        state.probability_buffer,
        sizeof(float),
        state.probability_buffer_count,
        state.probability_grid
    );
    if (written != state.probability_buffer_count) return 0;
    state.probability_buffer_count = 0;
    return 1;
}

static int append_probability(float value) {
    state.probability_buffer[state.probability_buffer_count++] = value;
    if (state.probability_buffer_count == OUTPUT_BUFFER_SIZE) {
        return flush_probability_buffer();
    }
    return 1;
}

static int decode_value(varfl value, int index) {
    size_t replication_count;
    int is_probability;
    int is_reflectivity;
    float output_value;

    if (index == _desc_special || index == add_f_special || index == ccitt_special) return 1;
    if (index < 0 || des[index] == NULL || des[index]->id != ELDESC) return 1;

    if (descriptor_is(index, 0, 30, 21)) state.rows = (int)value;
    else if (descriptor_is(index, 0, 30, 22)) state.columns = (int)value;
    else if (descriptor_is(index, 0, 5, 33)) state.pixel_size_x = value;
    else if (descriptor_is(index, 0, 6, 33)) state.pixel_size_y = value;
    else if (descriptor_is(index, 0, 29, 1)) state.projection_type = (int)value;
    else if (descriptor_is(index, 0, 29, 2)) state.coordinate_grid_type = (int)value;
    else if (descriptor_is(index, 0, 6, 198)) state.longitude_origin = value;
    else if (descriptor_is(index, 0, 5, 194)) state.projection_center = value;
    else if (descriptor_is(index, 0, 5, 195)) state.reference_latitude = value;
    else if (descriptor_is(index, 0, 29, 192)) state.geodetic_system = value;
    else if (descriptor_is(index, 0, 30, 192)) state.scan_mode = value;
    else if (
        descriptor_is(index, 0, 5, 1) &&
        state.rows > 0 &&
        !state.have_top_left_latitude
    ) {
        state.top_left_latitude = value;
        state.have_top_left_latitude = 1;
    } else if (
        descriptor_is(index, 0, 6, 1) &&
        state.columns > 0 &&
        !state.have_top_left_longitude
    ) {
        state.top_left_longitude = value;
        state.have_top_left_longitude = 1;
    }

    if (state.expected_pixels == 0 && state.rows > 0 && state.columns > 0) {
        state.expected_pixels = (size_t)state.rows * (size_t)state.columns;
    }

    if (descriptor_is(index, 0, 31, 192) && value != MISSVAL) {
        replication_count = (size_t)value;
        state.replication_armed = (
            state.expected_pixels > 0 && replication_count == state.expected_pixels
        );
        return 1;
    }

    is_probability = descriptor_is(index, 0, 21, 120);
    is_reflectivity = descriptor_is(index, 0, 21, 1);
    if (state.replication_armed) {
        state.replication_armed = 0;
        if (is_probability) state.capturing_probability = 1;
        else if (is_reflectivity) state.capturing_reflectivity = 1;
    }

    if (state.capturing_probability && is_probability) {
        if (state.probability_pixel_count >= state.expected_pixels) {
            state.capturing_probability = 0;
            return 1;
        }

        if (value == MISSVAL) {
            output_value = OUTPUT_NODATA;
            state.probability_missing_count++;
        } else {
            output_value = (float)value;
            if (value < state.minimum_probability) state.minimum_probability = value;
            if (value > state.maximum_probability) state.maximum_probability = value;
        }

        state.probability_pixel_count++;
        if (state.probability_pixel_count == state.expected_pixels) {
            state.capturing_probability = 0;
        }
        return append_probability(output_value);
    }

    if (!state.capturing_reflectivity || !is_reflectivity) return 1;
    if (state.pixel_count >= state.expected_pixels) {
        state.capturing_reflectivity = 0;
        return 1;
    }

    if (value == MISSVAL) {
        output_value = OUTPUT_NODATA;
        state.missing_count++;
    } else {
        output_value = (float)value;
        if (value < state.minimum_dbzh) state.minimum_dbzh = value;
        if (value > state.maximum_dbzh) state.maximum_dbzh = value;
        if (value <= -40.0) state.undetect_count++;
        if (value >= 5.5) state.visible_count++;
        if (value >= 35.0) state.strong_count++;
    }

    state.pixel_count++;
    if (state.pixel_count == state.expected_pixels) state.capturing_reflectivity = 0;
    return append_pixel(output_value);
}

static int write_metadata(const char *path, const sect_1_t *section) {
    FILE *output = fopen(path, "wb");
    if (output == NULL) return 0;

    fprintf(output, "{\n");
    fprintf(output, "  \"schemaVersion\": 1,\n");
    fprintf(output, "  \"provider\": \"Météo-France\",\n");
    fprintf(output, "  \"product\": \"Mosaique_metropole_Z_1km\",\n");
    fprintf(output, "  \"quantity\": \"DBZH\",\n");
    fprintf(
        output,
        "  \"timestamp\": \"%04d-%02d-%02dT%02d:%02d:%02dZ\",\n",
        section->year,
        section->mon,
        section->day,
        section->hour,
        section->min,
        section->sec
    );
    fprintf(output, "  \"rows\": %d,\n", state.rows);
    fprintf(output, "  \"columns\": %d,\n", state.columns);
    fprintf(output, "  \"pixelCount\": %lu,\n", (unsigned long)state.pixel_count);
    fprintf(
        output,
        "  \"probabilityPixelCount\": %lu,\n",
        (unsigned long)state.probability_pixel_count
    );
    fprintf(output, "  \"missingPixels\": %lu,\n", (unsigned long)state.missing_count);
    fprintf(
        output,
        "  \"probabilityMissingPixels\": %lu,\n",
        (unsigned long)state.probability_missing_count
    );
    fprintf(output, "  \"undetectPixels\": %lu,\n", (unsigned long)state.undetect_count);
    fprintf(output, "  \"visiblePixels\": %lu,\n", (unsigned long)state.visible_count);
    fprintf(output, "  \"strongPixels\": %lu,\n", (unsigned long)state.strong_count);
    fprintf(output, "  \"nodata\": %.1f,\n", (double)OUTPUT_NODATA);
    fprintf(output, "  \"undetectDbzh\": -40.0,\n");
    fprintf(output, "  \"minimumProbability\": %.7f,\n", state.minimum_probability);
    fprintf(output, "  \"maximumProbability\": %.7f,\n", state.maximum_probability);
    fprintf(output, "  \"minimumDbzh\": %.7f,\n", state.minimum_dbzh);
    fprintf(output, "  \"maximumDbzh\": %.7f,\n", state.maximum_dbzh);
    fprintf(output, "  \"pixelSizeX\": %.7f,\n", state.pixel_size_x);
    fprintf(output, "  \"pixelSizeY\": %.7f,\n", state.pixel_size_y);
    fprintf(output, "  \"topLeftLatitude\": %.7f,\n", state.top_left_latitude);
    fprintf(output, "  \"topLeftLongitude\": %.7f,\n", state.top_left_longitude);
    fprintf(output, "  \"projectionType\": %d,\n", state.projection_type);
    fprintf(output, "  \"coordinateGridType\": %d,\n", state.coordinate_grid_type);
    fprintf(output, "  \"longitudeOrigin\": %.7f,\n", state.longitude_origin);
    fprintf(output, "  \"projectionCenter\": %.7f,\n", state.projection_center);
    fprintf(output, "  \"referenceLatitude\": %.7f,\n", state.reference_latitude);
    fprintf(output, "  \"geodeticSystem\": %.7f,\n", state.geodetic_system);
    fprintf(output, "  \"scanMode\": %.7f\n", state.scan_mode);
    fprintf(output, "}\n");
    return fclose(output) == 0;
}

static int decode_message(
    const char *table_directory,
    const char *input_path,
    const char *grid_path,
    const char *probability_grid_path,
    const char *metadata_path
) {
    bufr_t message;
    sect_1_t section;
    dd *descriptors = NULL;
    int descriptor_handle = -1;
    int descriptor_count;
    int subsets;
    int ok = 1;

    memset(&message, 0, sizeof(bufr_t));
    memset(&section, 0, sizeof(sect_1_t));
    memset(&state, 0, sizeof(decoder_state_t));
    state.minimum_dbzh = DBL_MAX;
    state.maximum_dbzh = -DBL_MAX;
    state.minimum_probability = DBL_MAX;
    state.maximum_probability = -DBL_MAX;

    state.grid = fopen(grid_path, "wb");
    if (state.grid == NULL) {
        fprintf(stderr, "Unable to create output grid: %s\n", grid_path);
        return 0;
    }
    state.probability_grid = fopen(probability_grid_path, "wb");
    if (state.probability_grid == NULL) {
        fprintf(stderr, "Unable to create probability grid: %s\n", probability_grid_path);
        fclose(state.grid);
        state.grid = NULL;
        return 0;
    }

    if (!bufr_read_file(&message, (char *)input_path)) ok = 0;
    if (ok && !bufr_decode_sections01(&section, &message)) ok = 0;
    if (
        ok &&
        read_tables(
            (char *)table_directory,
            section.vmtab,
            section.vltab,
            section.subcent,
            section.gencent
        ) < 0
    ) ok = 0;

    if (ok) {
        descriptor_handle = bufr_open_descsec_r(&message, &subsets);
        if (descriptor_handle < 0 || bufr_open_datasect_r(&message) < 0) ok = 0;
    }

    descriptor_count = ok ? bufr_get_ndescs(&message) : 0;
    if (ok && !bufr_in_descsec(&descriptors, descriptor_count, descriptor_handle)) ok = 0;

    while (ok && subsets-- > 0) {
        ok = bufr_parse_out(descriptors, 0, descriptor_count - 1, decode_value, 0);
    }

    if (ok) ok = flush_output_buffer();
    if (ok) ok = flush_probability_buffer();
    if (fclose(state.grid) != 0) ok = 0;
    state.grid = NULL;
    if (fclose(state.probability_grid) != 0) ok = 0;
    state.probability_grid = NULL;

    if (ok && state.expected_pixels != state.pixel_count) {
        fprintf(
            stderr,
            "Decoded %lu pixels, expected %lu.\n",
            (unsigned long)state.pixel_count,
            (unsigned long)state.expected_pixels
        );
        ok = 0;
    }
    if (ok && state.expected_pixels != state.probability_pixel_count) {
        fprintf(
            stderr,
            "Decoded %lu probability pixels, expected %lu.\n",
            (unsigned long)state.probability_pixel_count,
            (unsigned long)state.expected_pixels
        );
        ok = 0;
    }
    if (ok && !write_metadata(metadata_path, &section)) ok = 0;

    if (descriptors != NULL) free(descriptors);
    if (descriptor_handle >= 0) bufr_close_descsec_r(descriptor_handle);
    bufr_close_datasect_r();
    bufr_free_data(&message);
    free_descs();

    if (!ok) {
        remove(grid_path);
        remove(probability_grid_path);
    }
    return ok;
}

int main(int argc, char **argv) {
    char *probability_path;
    int result;

    if (argc != 5) {
        fprintf(
            stderr,
            "Usage: %s TABLE_DIRECTORY INPUT.bufr OUTPUT.float32 OUTPUT.json\n",
            argv[0]
        );
        return EXIT_FAILURE;
    }

    probability_path = malloc(strlen(argv[3]) + strlen(".probability") + 1);
    if (probability_path == NULL) return EXIT_FAILURE;
    sprintf(probability_path, "%s.probability", argv[3]);
    result = decode_message(argv[1], argv[2], argv[3], probability_path, argv[4])
        ? EXIT_SUCCESS
        : EXIT_FAILURE;
    free(probability_path);
    return result;
}
